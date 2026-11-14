import datetime
import tempfile
from pathlib import Path
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from products.models import CostSetting, Product, ProductPart
from sales.models import Sale, SaleItem
from stock.models import PackSet, PackSetLine, Part, PartKind

from .. import naver
from ..models import StoreImport, StoreLink

API = '/api/v0'
TODAY = datetime.date(2026, 11, 14)


def detail(
    po_id,
    qty=150,
    status='PAYED',
    amount=None,
    option='글자: A / 스위치: 청축',
    product_id='13860694961',
    order_id='2026111074714211',
    fee=(16335, 13500),
    shipping=0,
    settle=None,
):
    """실제 응답(2026-11-14 조회)과 같은 모양의 상품 주문 상세 한 건"""
    amount = 3000 * qty if amount is None else amount
    return {
        'order': {
            'orderId': order_id,
            'orderDate': '2026-11-10T19:06:32.340+09:00',
            'paymentDate': '2026-11-10T19:06:40.311+09:00',
        },
        'productOrder': {
            'productOrderId': po_id,
            'quantity': 150,
            'remainQuantity': qty,
            'totalPaymentAmount': 450000,
            'remainPaymentAmount': amount,
            'productOrderStatus': status,
            'productId': product_id,
            'productName': '[한층공방] ABC 키캡 클리커 키링 1구',
            'productOption': option,
            'unitPrice': 3000,
            'deliveryFeeAmount': shipping,
            'paymentCommission': fee[0],
            'saleCommission': 0,
            'knowledgeShoppingSellingInterlockCommission': fee[1],
            'channelCommission': 0,
            'expectedSettlementAmount': (amount - sum(fee)) if settle is None else settle,
        },
    }


@override_settings(NAVER_COMMERCE_KEY_FILE='')
@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class StoreOrderTests(APITestCase):
    def setUp(self):
        self.switch = Part.objects.create(name='청축 스위치', price=27000, pack_qty=180, stock=180)
        self.hook = Part.objects.create(name='후크 키링', price=16836, pack_qty=300, stock=300)
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', price=8900, pack_qty=500, stock=50)
        pack = PackSet.objects.create(name='봉투 포장')
        PackSetLine.objects.create(pack_set=pack, part=self.bag, qty=1)
        self.clicker = Product.objects.create(name='ABC 1구 클리커', sale_price=3000, default_pack=pack)
        ProductPart.objects.create(product=self.clicker, part=self.switch, qty=1)
        ProductPart.objects.create(product=self.clicker, part=self.hook, qty=1)
        CostSetting.objects.update_or_create(pk=1, defaults={'shipping_cost': 3300})
        self.remote = [detail('2026111094085851')]
        patches = [
            mock.patch.object(
                naver,
                'changed_product_orders',
                side_effect=lambda s, e: [d['productOrder']['productOrderId'] for d in self.remote],
            ),
            mock.patch.object(
                naver,
                'product_orders',
                side_effect=lambda ids: [d for d in self.remote if d['productOrder']['productOrderId'] in ids],
            ),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def preview(self, **q):
        res = self.client.get(f'{API}/store/orders/', {'date_from': '2026-11-10', 'date_to': '2026-11-14', **q})
        self.assertEqual(res.status_code, 200, res.data)
        return res.data['orders']

    def link(self, product=None):
        StoreLink.objects.filter(option='').update(product=product or self.clicker)

    def put(self, total=1, costs=None):
        ids = [d['productOrder']['productOrderId'] for d in self.remote]
        body = {
            'date_from': '2026-11-10',
            'date_to': '2026-11-14',
            'product_order_ids': ids,
            'total': total,
            'costs': costs or {str(self.clicker.pk): 1200},
        }
        res = self.client.post(f'{API}/store/orders/', body, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def stocks(self):
        return [Part.objects.get(pk=p.pk).stock for p in (self.switch, self.hook, self.bag)]

    def test_new_store_product_needs_link_then_ok(self, _):
        o = self.preview()[0]
        self.assertEqual((o['kind'], o['lines'][0]['product']), ('need', None))
        base = StoreLink.objects.get()
        self.assertEqual(
            (base.store_product_id, base.option, base.store_name),
            ('13860694961', '', '[한층공방] ABC 키캡 클리커 키링 1구'),
        )
        self.link()
        o = self.preview()[0]
        self.assertEqual((o['kind'], o['lines'][0]['product_name']), ('ok', 'ABC 1구 클리커'))
        # 실제 주문: 수수료 = 결제 16,335 + 판매연동 13,500, 정산 = 네이버 예정 금액과 같음
        self.assertEqual((o['gross'], o['fee'], o['settle'], o['naver_settle']), (450000, 29835, 420165, 420165))
        self.assertEqual((o['status_label'], o['date']), ('결제완료', datetime.date(2026, 11, 10)))

    def test_option_link_picks_other_product(self, _):
        red = Product.objects.create(name='ABC 1구 클리커 (적축)')
        self.preview()
        self.link()
        StoreLink.objects.create(store_product_id='13860694961', store_name='x', option='스위치: 적축', product=red)
        self.remote = [detail('1', option='글자: B / 스위치: 적축')]
        self.assertEqual(self.preview()[0]['lines'][0]['product'], red.pk)

    def test_import_makes_sale_takes_stock_and_records(self, _):
        self.preview()
        self.link()
        record = self.put(total=3)
        sale = Sale.objects.get()
        self.assertEqual(
            (sale.channel, sale.order_no, sale.date), ('store', '2026111074714211', datetime.date(2026, 11, 10))
        )
        self.assertEqual((sale.fee, sale.shipping_received, sale.shipping_cost), (29835, 0, 3300))
        item = sale.items.get()
        self.assertEqual(
            (item.qty, item.unit_price, item.unit_cost, item.store_item_id), (150, 3000, 1200, '2026111094085851')
        )
        self.assertEqual([(p.part_id, p.qty) for p in sale.packs.all()], [(self.bag.pk, 1)])  # 기본 포장
        self.assertEqual(self.stocks(), [30, 150, 49])
        self.assertEqual((record['added'], record['updated'], record['skipped']), (1, 0, 2))
        self.assertEqual(self.preview()[0]['kind'], 'dup')  # 다시 가져오면 이미 있음

    def test_partial_cancel_syncs_quantity_and_stock(self, _):
        self.preview()
        self.link()
        self.put()
        self.remote = [detail('2026111094085851', qty=100, fee=(10890, 9000))]
        o = self.preview()[0]
        self.assertEqual(o['kind'], 'sync')
        self.assertEqual(o['changes'], ['ABC 1구 클리커 150개 → 100개', '수수료 29,835 → 19,890'])
        record = self.put()
        item = SaleItem.objects.get()
        self.assertEqual((item.qty, item.sale.fee), (100, 19890))
        self.assertEqual(self.stocks(), [80, 200, 49])  # 50개씩 되돌림 (포장은 주문 단위라 그대로)
        self.assertEqual((record['added'], record['updated']), (0, 1))

    def test_full_cancel_deletes_sale_and_reverts_stock(self, _):
        self.preview()
        self.link()
        self.put()
        self.remote = [detail('2026111094085851', qty=0, status='CANCELED')]
        self.assertEqual(self.preview()[0]['kind'], 'gone')
        self.put()
        self.assertFalse(Sale.objects.exists())
        self.assertEqual(self.stocks(), [180, 300, 50])

    def test_cancelled_or_waiting_new_orders_are_not_added(self, _):
        self.preview()
        self.link()
        self.remote = [
            detail('1', qty=0, status='CANCELED', order_id='A'),
            detail('2', status='PAYMENT_WAITING', order_id='B'),
        ]
        self.assertEqual([o['kind'] for o in self.preview()], ['cancel', 'wait'])
        self.assertEqual(self.put(total=2)['skipped'], 2)
        self.assertFalse(Sale.objects.exists())

    def test_manual_sale_with_same_order_no_is_dup(self, _):
        Sale.objects.create(order_no='2026111074714211')
        self.link()
        o = self.preview()[0]
        self.assertEqual((o['kind'], o['manual']), ('dup', True))

    def test_settle_mismatch_is_reported(self, _):
        self.preview()
        self.link()
        self.remote = [detail('2026111094085851', settle=400000)]
        o = self.preview()[0]
        self.assertNotEqual(o['settle'], o['naver_settle'])

    def test_range_limit(self, _):
        res = self.client.get(f'{API}/store/orders/', {'date_from': '2026-09-01', 'date_to': '2026-11-14'})
        self.assertEqual(res.status_code, 400)
        res = self.client.get(f'{API}/store/orders/', {'date_from': '2026-11-14', 'date_to': '2026-11-01'})
        self.assertEqual(res.status_code, 400)

    def test_connection_without_key(self, _):
        with mock.patch.dict('os.environ', {'NAVER_COMMERCE_CLIENT_ID': '', 'NAVER_COMMERCE_CLIENT_SECRET': ''}):
            res = self.client.get(f'{API}/store/connection/')
        self.assertEqual((res.status_code, res.data['state'], res.data['last_import']), (200, 'nokey', None))
        StoreImport.objects.create(date_from=TODAY, date_to=TODAY, added=1)
        with mock.patch.object(naver, 'token', return_value='t'):
            res = self.client.get(f'{API}/store/connection/')
        self.assertEqual((res.data['state'], res.data['last_import']['added']), ('ok', 1))


class StoreLinkApiTests(APITestCase):
    def setUp(self):
        self.base = StoreLink.objects.create(store_product_id='111', store_name='클리커')
        self.red = Product.objects.create(name='적축')

    def test_add_option_rule_and_guards(
        self,
    ):
        res = self.client.post(
            f'{API}/store/links/', {'store_product_id': '111', 'option': ' 스위치: 적축 ', 'product': self.red.pk}
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(
            (res.data['option'], res.data['store_name'], res.data['product_name']), ('스위치: 적축', '클리커', '적축')
        )
        res = self.client.post(f'{API}/store/links/', {'store_product_id': '111', 'option': '스위치: 적축'})
        self.assertEqual(res.status_code, 400)
        res = self.client.post(f'{API}/store/links/', {'store_product_id': '999', 'option': 'x'})
        self.assertEqual(res.data['store_product_id'], ['가져온 적이 없는 스토어 상품입니다.'])
        res = self.client.delete(f'{API}/store/links/{self.base.pk}/')
        self.assertEqual(res.status_code, 400)
        res = self.client.patch(f'{API}/store/links/{self.base.pk}/', {'product': self.red.pk}, format='json')
        self.assertEqual((res.status_code, res.data['product_name']), (200, '적축'))


class NaverClientTests(TestCase):
    def test_keys_from_file_without_exposing(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / 'k.env'
            f.write_text(
                '# 메모\nNAVER_CLIENT_ID=abc\nNAVER_CLIENT_SECRET="$2a$04$abcdefghijklmnopqrstuu"\n', encoding='utf-8'
            )
            with (
                override_settings(NAVER_COMMERCE_KEY_FILE=str(f)),
                mock.patch.dict('os.environ', {'NAVER_COMMERCE_CLIENT_ID': ''}),
            ):
                self.assertEqual(naver.read_keys(), ('abc', '$2a$04$abcdefghijklmnopqrstuu'))
        with (
            override_settings(NAVER_COMMERCE_KEY_FILE=''),
            mock.patch.dict('os.environ', {'NAVER_COMMERCE_CLIENT_ID': ''}),
        ):
            with self.assertRaises(naver.NoKey):
                naver.read_keys()

    def test_changed_orders_by_day_and_more(self):
        kst = naver.KST
        pages = {
            ('2026-11-12', None): {
                'data': {
                    'lastChangeStatuses': [{'productOrderId': '1'}],
                    'more': {'moreFrom': '2026-11-12T10:00:00.000+09:00', 'moreSequence': '9'},
                }
            },
            ('2026-11-12', '9'): {'data': {'lastChangeStatuses': [{'productOrderId': '2'}, {'productOrderId': '1'}]}},
            ('2026-11-13', None): {'data': {'lastChangeStatuses': [{'productOrderId': '3'}]}},
        }
        calls = []

        def fake(method, path, params=None, **kw):
            calls.append(params)
            return pages[
                (
                    params['lastChangedFrom'][:10] if 'moreSequence' not in params else '2026-11-12',
                    params.get('moreSequence'),
                )
            ]

        with mock.patch.object(naver, 'call', side_effect=fake):
            ids = naver.changed_product_orders(
                datetime.datetime(2026, 11, 12, tzinfo=kst), datetime.datetime(2026, 11, 14, tzinfo=kst)
            )
        self.assertEqual(ids, ['1', '2', '3'])
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0]['lastChangedTo'], '2026-11-13T00:00:00.000+09:00')
