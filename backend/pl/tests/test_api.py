import datetime
from decimal import Decimal
from unittest import mock

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from expenses.models import Expense
from filaments.models import Brand, Color, Filament, Material, Spool
from products.models import Product, ProductPart
from sales.models import Sale, SaleItem, SalePack, SalePart, default_parts
from stock import services as stock
from stock.models import Part, PartKind

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)
KST = datetime.timezone(datetime.timedelta(hours=9))


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class PlApiTests(APITestCase):
    def setUp(self):
        filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'),
            material=Material.objects.create(name='PLA'),
            series='Basic',
            price=Decimal('20000'),
        )
        self.white = Color.objects.create(filament=filament, name='화이트', hex='#FFFFFF')  # 가격 없음 → 필라멘트 가격
        self.black = Color.objects.create(filament=filament, name='블랙', hex='#000000', price=Decimal('22000'))

    def sale(self, date, *items, shipping=0, fee=0):
        s = Sale.objects.create(date=date, shipping_received=shipping, fee=fee)
        for qty, price in items:
            SaleItem.objects.create(sale=s, product_name='제품', qty=qty, unit_price=price)
        return s

    def spool(self, color, opened, price=None):
        return Spool.objects.create(color=color, price=price, status='open', opened_at=opened)

    def get(self):
        res = self.client.get(f'{API}/pl/')
        self.assertEqual(res.status_code, 200)
        return {m['month']: m for m in res.data['months']}

    def test_empty_gives_this_month_only(self, _):
        months = self.get()
        self.assertEqual(list(months), ['2026-10'])
        m = months['2026-10']
        self.assertEqual((m['gross'], m['fee'], m['spool'], m['sales'], m['spools']), (0, 0, 0, 0, 0))
        self.assertEqual(m['expenses']['tax'], 0)
        self.assertEqual(len(m['expenses']), 9)

    def test_monthly_sums_from_first_record_to_this_month(self, _):
        Expense.objects.create(date='2026-07-11', name='프린터', category='invest', amount=1090000)
        Expense.objects.create(date='2026-07-20', name='PLA 2롤', category='filament', amount=40000)
        Expense.objects.create(date='2026-09-05', name='AI 구독', category='sub', amount=29000)
        Expense.objects.create(date='2026-09-30', name='택배비', category='sell', amount=31500)
        Expense.objects.create(date='2026-09-12', name='택배비', category='sell', amount=500)
        self.sale('2026-09-03', (2, 18900), (1, 4900), shipping=3000, fee=2152)
        self.sale('2026-09-12', (1, 85000))
        months = self.get()
        # 기록 없는 8월도 0 으로, 이번 달(10월)까지
        self.assertEqual(list(months), ['2026-07', '2026-08', '2026-09', '2026-10'])
        self.assertEqual(months['2026-07']['expenses']['invest'], 1090000)
        self.assertEqual(months['2026-07']['expenses']['filament'], 40000)
        self.assertEqual(months['2026-08']['sales'], 0)
        sep = months['2026-09']
        self.assertEqual((sep['gross'], sep['shipping'], sep['fee'], sep['sales']), (127700, 3000, 2152, 2))
        self.assertEqual((sep['expenses']['sub'], sep['expenses']['sell']), (29000, 32000))

    def test_spools_by_opened_month_with_price_fallback(self, _):
        # 구매가 → 색상 가격 → 필라멘트 가격
        self.spool(self.white, datetime.datetime(2026, 9, 10, 12, tzinfo=KST), price=Decimal('18000'))
        self.spool(self.black, datetime.datetime(2026, 9, 26, 12, tzinfo=KST))
        self.spool(self.white, datetime.datetime(2026, 10, 2, 12, tzinfo=KST))
        # 뜯지 않은 스풀은 넣지 않음
        Spool.objects.create(color=self.white, price=Decimal('18000'))
        months = self.get()
        self.assertEqual((months['2026-09']['spool'], months['2026-09']['spools']), (40000, 2))
        self.assertEqual((months['2026-10']['spool'], months['2026-10']['spools']), (20000, 1))
        self.assertEqual(months['2026-10']['spools_unpriced'], 0)

    def test_spool_month_is_local_time(self, _):
        # 한국 시간 10월 1일 새벽 = UTC 9월 30일 → 10월로
        self.spool(self.white, datetime.datetime(2026, 10, 1, 1, tzinfo=KST))
        self.assertEqual(self.get()['2026-10']['spools'], 1)

    def test_spool_without_any_price_is_counted(self, _):
        self.white.filament.price = None
        self.white.filament.save()
        self.spool(self.white, datetime.datetime(2026, 10, 2, 12, tzinfo=KST))
        m = self.get()['2026-10']
        self.assertEqual((m['spool'], m['spools'], m['spools_unpriced']), (0, 1, 1))

    def test_query_count_does_not_grow(self, _):
        for d in ('2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03'):
            self.sale(d, (1, 10000), (2, 5000))
            Expense.objects.create(date=d, name='구독', category='sub', amount=1000)
        with CaptureQueriesContext(connection) as ctx:
            self.get()
        self.assertLessEqual(len(ctx), 5)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class PartsUsedTests(APITestCase):
    """손익 기준의 부속품 · 포장재 = 쓴 만큼 (판매 + 조정, 처음 수량 빼고) × 그때 단가"""

    def setUp(self):
        # 자석 200개 12,000원 → 개당 60원 · 봉투 500장 8,900원 → 17.8원
        self.magnet = Part.objects.create(name='자석', price=12000, pack_qty=200)
        self.bag = Part.objects.create(kind=PartKind.PACK, name='OPP 봉투', price=8900, pack_qty=500)
        self.glue = Part.objects.create(kind=PartKind.SUPPLY, name='접착제', price=5000)
        self.keyring = Product.objects.create(name='이름 키링', sale_price=5000)
        ProductPart.objects.create(product=self.keyring, part=self.magnet, qty=2)

    def sell(self, date, qty):
        sale = Sale.objects.create(date=date)
        SaleItem.objects.create(sale=sale, product=self.keyring, qty=qty, unit_price=5000)
        SalePack.objects.create(sale=sale, part=self.bag, qty=1)
        for part, n in default_parts([(self.keyring, qty)]).items():
            SalePart.objects.create(sale=sale, part=part, qty=n)
        stock.sync_sale(sale)
        return sale

    def month(self, key):
        # 기록이 없어 목록에 없는 달은 0
        months = {m['month']: m for m in self.client.get(f'{API}/pl/').data['months']}
        return months.get(key, {'parts_used': 0, 'parts_unpriced': 0})

    def test_sale_and_adjust_count_but_not_start_or_supply(self, _):
        stock.move(self.magnet, 'adjust', 100, stock.START_NOTE)  # 처음 수량 — 쓴 것 아님
        stock.move(self.glue, 'use', -1, '다 씀')  # 소모품 — 운영비(산 날)
        self.sell('2026-10-05', 3)  # 자석 6개 360 + 봉투 1장 17.8
        stock.move(self.magnet, 'adjust', -4, '불량', date=datetime.date(2026, 10, 20))  # 자석 4개 240
        m = self.month('2026-10')
        self.assertEqual((m['parts_used'], m['parts_unpriced']), (618, 0))

    def test_past_month_keeps_price_when_price_changes(self, _):
        self.sell('2026-09-10', 1)  # 자석 2개 120 + 봉투 17.8
        self.magnet.price = 30000
        self.magnet.save()
        self.assertEqual(self.month('2026-09')['parts_used'], 138)

    def test_deleted_sale_nets_zero_in_its_month(self, _):
        sale = self.sell('2026-09-10', 2)
        self.magnet.price = 30000  # 지울 때 단가가 바뀌어도 빠질 때 단가로 되돌림
        self.magnet.save()
        stock.revert_sale(sale)
        sale.delete()
        self.assertEqual(self.month('2026-09')['parts_used'], 0)

    def test_editing_sale_date_moves_its_usage(self, _):
        sale = self.sell('2026-09-10', 1)
        sale.date = datetime.date(2026, 10, 2)
        sale.save()
        stock.sync_sale(sale)
        self.assertEqual(self.month('2026-09')['parts_used'], 0)
        self.assertEqual(self.month('2026-10')['parts_used'], 138)

    def test_part_without_price_is_counted(self, _):
        self.magnet.price = None
        self.magnet.save()
        self.sell('2026-10-05', 1)
        m = self.month('2026-10')
        self.assertEqual((m['parts_used'], m['parts_unpriced']), (18, 1))
