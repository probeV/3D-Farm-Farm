import datetime
from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from products.models import Product

from ..models import Sale, SaleItem

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class SaleApiTests(APITestCase):
    def setUp(self):
        self.disc = Product.objects.create(name='분수 원판 세트', sale_price=18900)
        self.ring = Product.objects.create(name='이름 키링', sale_price=4900)

    def body(self, **kwargs):
        return {
            'date': '2026-10-23',
            'channel': 'store',
            'order_no': '2026102389012',
            'items': [
                {'product': self.disc.pk, 'qty': 2, 'unit_price': 18900, 'unit_cost': 3227},
                {'product': self.ring.pk, 'qty': 1, 'unit_price': 4900, 'unit_cost': 191},
            ],
            **kwargs,
        }

    def test_create_store_sale_auto_fee_and_totals(self, _):
        res = self.client.post(f'{API}/sales/', self.body(shipping_cost=3300), format='json')
        self.assertEqual(res.status_code, 201, res.data)
        d = res.data
        # 판매가 42,700 · 수수료 = 42,700 × 4.71% = 2,011 (자동) · 정산 = 42,700 + 0 − 2,011
        self.assertEqual((d['gross'], d['fee'], d['settle']), (42700, 2011, 40689))
        # 원가 3,227 × 2 + 191 = 6,645 → 이익 = 40,689 − 6,645 − 3,300
        self.assertEqual((d['cost'], d['profit']), (6645, 30744))
        self.assertEqual([i['product_name'] for i in d['items']], ['분수 원판 세트', '이름 키링'])
        self.assertEqual(d['items'][0]['amount'], 37800)

    def test_fee_sent_is_kept_and_direct_sale_is_zero(self, _):
        res = self.client.post(f'{API}/sales/', self.body(fee=2000), format='json')
        self.assertEqual(res.data['fee'], 2000)
        res = self.client.post(f'{API}/sales/', self.body(channel='direct', order_no=''), format='json')
        self.assertEqual(res.data['fee'], 0)

    def test_cost_missing_gives_no_profit(self, _):
        items = [{'product': self.disc.pk, 'qty': 1, 'unit_price': 18900, 'unit_cost': None}]
        res = self.client.post(f'{API}/sales/', self.body(items=items), format='json')
        self.assertEqual((res.data['cost'], res.data['profit']), (None, None))

    def test_patch_items_replaces_and_keeps_given_name(self, _):
        pk = self.client.post(f'{API}/sales/', self.body(), format='json').data['id']
        # 팔 때 이름을 보내면 그 이름 그대로 (제품 이름이 바뀌어도)
        self.disc.name = '분수 원판 세트 (자석형)'
        self.disc.save()
        items = [
            {
                'product': self.disc.pk,
                'product_name': '분수 원판 세트',
                'qty': 3,
                'unit_price': 18000,
                'unit_cost': 3227,
            }
        ]
        res = self.client.patch(f'{API}/sales/{pk}/', {'items': items}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([(i['product_name'], i['qty']) for i in res.data['items']], [('분수 원판 세트', 3)])
        self.assertEqual(res.data['gross'], 54000)
        # 줄을 보내지 않으면 줄은 그대로
        res = self.client.patch(f'{API}/sales/{pk}/', {'note': '이름 각인'}, format='json')
        self.assertEqual(len(res.data['items']), 1)

    def test_deleted_product_line_can_be_saved_again(self, _):
        pk = self.client.post(f'{API}/sales/', self.body(), format='json').data['id']
        self.ring.delete()
        lines = self.client.get(f'{API}/sales/{pk}/').data['items']
        self.assertEqual((lines[1]['product'], lines[1]['product_name']), (None, '이름 키링'))
        res = self.client.patch(f'{API}/sales/{pk}/', {'items': lines}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(SaleItem.objects.filter(product=None, product_name='이름 키링').count(), 1)

    def test_validation(self, _):
        res = self.client.post(f'{API}/sales/', self.body(items=[]), format='json')
        self.assertEqual(res.data['items'], ['제품을 한 개 이상 넣으세요.'])
        res = self.client.post(f'{API}/sales/', self.body(items=[{'qty': 1, 'unit_price': 1000}]), format='json')
        self.assertEqual(res.data['items'][0]['product'], ['제품을 고르세요.'])
        res = self.client.post(f'{API}/sales/', self.body(date='2026-10-29'), format='json')
        self.assertEqual(res.data['date'], ['오늘 이후 날짜는 넣을 수 없습니다.'])
        res = self.client.post(f'{API}/sales/', self.body(channel='naver'), format='json')
        self.assertEqual(res.data['channel'], ['없는 판매처입니다.'])
        items = [{'product': self.disc.pk, 'qty': 0, 'unit_price': 1000}]
        res = self.client.post(f'{API}/sales/', self.body(items=items), format='json')
        self.assertIn('qty', res.data['items'][0])

    def test_order_no_duplicate(self, _):
        pk = self.client.post(f'{API}/sales/', self.body(), format='json').data['id']
        res = self.client.post(f'{API}/sales/', self.body(), format='json')
        self.assertEqual(res.data['order_no'], ['이미 넣은 주문번호입니다.'])
        # 자기 자신은 그대로 저장 가능 · 빈 주문번호는 여러 개
        self.assertEqual(
            self.client.patch(f'{API}/sales/{pk}/', {'order_no': '2026102389012'}, format='json').status_code, 200
        )
        for _i in range(2):
            self.assertEqual(self.client.post(f'{API}/sales/', self.body(order_no=''), format='json').status_code, 201)

    def test_list_newest_first_without_n_plus_1(self, _):
        for day, no in [(5, 'a'), (20, 'b'), (11, 'c')]:
            self.client.post(f'{API}/sales/', self.body(date=f'2026-10-{day:02d}', order_no=no), format='json')
        with CaptureQueriesContext(connection) as q:
            res = self.client.get(f'{API}/sales/')
        self.assertEqual([s['order_no'] for s in res.data], ['b', 'c', 'a'])
        self.assertLessEqual(len(q), 2)  # 판매 + 줄 (판매 수와 상관없이)

    def test_delete(self, _):
        pk = self.client.post(f'{API}/sales/', self.body(), format='json').data['id']
        self.assertEqual(self.client.delete(f'{API}/sales/{pk}/').status_code, 204)
        self.assertFalse(Sale.objects.exists())
        self.assertFalse(SaleItem.objects.exists())
