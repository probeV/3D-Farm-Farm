import datetime
from decimal import Decimal
from unittest import mock

from rest_framework.test import APITestCase

from products.models import Product, ProductPart
from sales.models import Sale, SaleItem

from .. import services
from ..models import Part, StockHistory

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class MovingAverageTests(APITestCase):
    """평균 단가(이동평균, v2 PL): 들어온 것을 남은 수량과 섞고, 나간 기록은 그때 평균으로"""

    def setUp(self):
        self.magnet = Part.objects.create(name='자석')
        self.keyring = Product.objects.create(name='키링', sale_price=5000)
        ProductPart.objects.create(product=self.keyring, part=self.magnet, qty=1)

    def buy(self, date, qty, amount):
        body = {
            'date': date,
            'name': '자석',
            'category': 'part',
            'amount': amount,
            'items': [{'part': self.magnet.pk, 'qty': qty}],
        }
        res = self.client.post(f'{API}/expenses/', body, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data['id']

    def sell(self, date, qty):
        sale = Sale.objects.create(date=date)
        SaleItem.objects.create(sale=sale, product=self.keyring, qty=qty, unit_price=5000)
        services.sync_sale(sale)
        return sale

    def avg(self):
        self.magnet.refresh_from_db()
        return self.magnet.avg_price

    def sale_prices(self):
        return [r.unit_price for r in StockHistory.objects.filter(kind='sale').order_by('date', 'id')]

    def test_new_buy_mixes_with_what_is_left_only(self, _):
        self.buy('2026-01-05', 100, 6000)  # 60원
        self.sell('2026-02-05', 80)  # 80 × 60
        self.buy('2026-03-05', 100, 15000)  # 남은 20 × 60 + 100 × 150 → 135
        self.sell('2026-03-10', 10)
        self.assertEqual(self.avg(), Decimal('135'))
        self.assertEqual(self.sale_prices(), [Decimal('60'), Decimal('135')])
        self.assertEqual(Part.objects.get(pk=self.magnet.pk).unit_price, Decimal('135'))

    def test_back_dated_buy_reprices_later_usage(self, _):
        self.buy('2026-01-05', 100, 6000)
        self.sell('2026-03-10', 50)
        self.buy('2026-02-01', 100, 15000)  # 3월 판매 전에 산 것 → 3월 판매 단가가 바뀜 (100 × 60 + 100 × 150) ÷ 200
        self.assertEqual(self.sale_prices(), [Decimal('105')])

    def test_deleting_buy_goes_back(self, _):
        self.buy('2026-01-05', 100, 6000)
        pk = self.buy('2026-03-05', 100, 15000)
        self.assertEqual(self.avg(), Decimal('105'))
        self.client.delete(f'{API}/expenses/{pk}/')
        self.assertEqual(self.avg(), Decimal('60'))

    def test_editing_buy_amount_changes_average(self, _):
        pk = self.buy('2026-01-05', 100, 6000)
        res = self.client.patch(f'{API}/expenses/{pk}/', {'amount': 9000}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.avg(), Decimal('90'))

    def test_sold_below_zero_then_bought_takes_new_price(self, _):
        self.sell('2026-01-05', 5)  # 아직 산 적 없음 → 단가 모름
        self.buy('2026-01-10', 100, 6000)
        self.assertEqual(self.avg(), Decimal('60'))
        self.assertEqual(self.sale_prices(), [None])

    def test_start_quantity_uses_typed_price_until_bought(self, _):
        res = self.client.post(
            f'{API}/parts/', {'name': '고리', 'price': 3000, 'pack_qty': 100, 'stock': 50}, format='json'
        )
        ring = Part.objects.get(pk=res.data['id'])
        self.assertEqual((ring.avg_price, res.data['unit_price'], res.data['avg_price']), (Decimal('30'), 30.0, 30.0))
        # 산 적이 없으면 구매가를 고치면 처음 수량 단가도
        self.client.patch(f'{API}/parts/{ring.pk}/', {'price': 4000}, format='json')
        ring.refresh_from_db()
        self.assertEqual(ring.avg_price, Decimal('40'))

    def test_bought_part_price_is_locked(self, _):
        self.buy('2026-01-05', 100, 6000)
        res = self.client.patch(f'{API}/parts/{self.magnet.pk}/', {'price': 1, 'note': '메모'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['price'], ['지출로 산 품목은 지출에서 바꾸세요.'])
        res = self.client.patch(f'{API}/parts/{self.magnet.pk}/', {'note': '메모'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data['avg_price'], res.data['bought']), (60.0, True))
