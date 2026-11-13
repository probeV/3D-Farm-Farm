"""지출 구매 줄 (v2 TBD-31) — 줄 금액 나누기 · 남은 수량 · 최근 구매가 · 스풀 등록"""

import datetime
from decimal import Decimal
from unittest import mock

from rest_framework.test import APITestCase

from filaments.models import Brand, Color, Filament, Material, Spool
from stock.models import Part, PartKind, StockHistory

from ..models import Expense, ExpenseLine

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class ExpenseLineApiTests(APITestCase):
    def setUp(self):
        filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'), material=Material.objects.create(name='PLA'), series='Basic'
        )
        self.white = Color.objects.create(filament=filament, name='화이트', hex='#F5F5F5', price=14400)
        self.black = Color.objects.create(filament=filament, name='블랙', hex='#1A1A1A')
        self.magnet = Part.objects.create(kind=PartKind.PART, name='네오디뮴 자석', price=12000, pack_qty=200)
        self.bolt = Part.objects.create(kind=PartKind.PART, name='M3 볼트')
        self.box = Part.objects.create(kind=PartKind.PACK, name='소형 박스')

    # ---- 도우미
    def post(self, category, amount, lines, date='2026-09-22', name='구매'):
        body = {'date': date, 'name': name, 'category': category, 'amount': amount, 'lines': lines}
        return self.client.post(f'{API}/expenses/', body, format='json')

    def patch(self, pk, **data):
        return self.client.patch(f'{API}/expenses/{pk}/', data, format='json')

    def spools(self, color, **data):
        return self.client.post(f'{API}/colors/{color.pk}/spools/', data, format='json')

    def refresh(self, *objs):
        for obj in objs:
            obj.refresh_from_db()

    # ---- 필라멘트
    def test_filament_split_by_spools(self, _):
        """금액을 비운 줄은 총액(배송비 포함)을 통 수대로 나눔 → 색상 가격 = 통당 금액"""
        res = self.post('filament', 108000, [{'color': self.white.pk, 'qty': 4}, {'color': self.black.pk, 'qty': 2}])
        self.assertEqual(res.status_code, 201, res.data)
        lines = res.data['lines']
        self.assertEqual(
            [(r['total'], r['each'], r['unit'], r['spools']) for r in lines],
            [
                (72000, 18000, '통', 0),
                (36000, 18000, '통', 0),
            ],
        )
        self.assertEqual(lines[0]['name'], 'Bambu Lab › PLA Basic · 화이트')
        self.refresh(self.white, self.black)
        self.assertEqual((self.white.price, self.black.price), (18000, 18000))

    def test_fixed_amount_and_rest(self, _):
        """금액 적은 줄은 그대로, 남은 금액을 비운 줄에"""
        res = self.post(
            'filament', 50000, [{'color': self.white.pk, 'qty': 2, 'amount': 30000}, {'color': self.black.pk, 'qty': 1}]
        )
        self.assertEqual([r['total'] for r in res.data['lines']], [30000, 20000])

    def test_spool_from_order(self, _):
        """재고 추가에서 주문을 고르면 구매가 · 구매일은 주문에서, 수량은 남은 통까지"""
        res = self.post('filament', 108000, [{'color': self.white.pk, 'qty': 4}, {'color': self.black.pk, 'qty': 2}])
        line = res.data['lines'][0]['id']

        buys = self.client.get(f'{API}/colors/{self.white.pk}/buys/').data
        self.assertEqual(
            buys,
            [
                {
                    'id': line,
                    'expense': res.data['id'],
                    'date': datetime.date(2026, 9, 22),
                    'name': '구매',
                    'qty': 4,
                    'spools': 0,
                    'each': 18000,
                }
            ],
        )

        made = self.spools(self.white, quantity=3, buy=line, price=1, purchased_at='2026-10-01')
        self.assertEqual(made.status_code, 201, made.data)
        self.assertEqual({(s['price'], s['purchased_at'], s['buy']) for s in made.data}, {(18000, '2026-09-22', line)})

        too_many = self.spools(self.white, quantity=2, buy=line)
        self.assertEqual(too_many.data['quantity'], ['이 주문은 1통 남았습니다.'])
        other_color = self.spools(self.black, quantity=1, buy=line)
        self.assertEqual(other_color.data['buy'], ['이 색상의 주문이 아닙니다.'])

        self.spools(self.white, quantity=1, buy=line)
        self.assertEqual(self.client.get(f'{API}/colors/{self.white.pk}/buys/').data, [])  # 다 등록하면 빠짐
        row = self.client.get(f'{API}/expenses/').data[0]['lines'][0]
        self.assertEqual(row['spools'], 4)

    def test_registered_spools_guard(self, _):
        """등록한 스풀이 있으면 그 줄의 색상 · 통 수(등록 수 아래로)는 못 바꿈. 줄 · 지출을 지우면 연결만 끊김"""
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 4}])
        pk, line = res.data['id'], res.data['lines'][0]['id']
        self.spools(self.white, quantity=2, buy=line)

        res = self.patch(pk, lines=[{'id': line, 'color': self.white.pk, 'qty': 1}])
        self.assertEqual(res.data['lines'][0]['qty'], ['스풀 2통을 이미 등록했습니다.'])
        res = self.patch(pk, lines=[{'id': line, 'color': self.black.pk, 'qty': 4}])
        self.assertEqual(res.data['lines'][0]['color'], ['스풀 2통을 이미 등록해서 색상을 바꿀 수 없습니다.'])

        res = self.patch(pk, amount=80000, lines=[{'id': line, 'color': self.white.pk, 'qty': 2}])
        self.assertEqual((res.data['lines'][0]['id'], res.data['lines'][0]['total']), (line, 80000))
        self.assertEqual(Spool.objects.filter(buy_id=line).count(), 2)
        self.assertEqual(set(Spool.objects.values_list('price', flat=True)), {18000})  # 이미 등록한 구매가는 그대로

        self.assertEqual(self.client.delete(f'{API}/expenses/{pk}/').status_code, 204)
        self.assertEqual(list(Spool.objects.values_list('buy', 'price')), [(None, 18000), (None, 18000)])

    # ---- 부속품 · 포장재 · 소모품
    def test_part_stock_and_price(self, _):
        """저장하면 남은 수량 + 수량 (입출고 기록 `지출`), 묶음 가격 · 수량 = 줄 금액 · 수량"""
        res = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}], date='2026-10-03', name='자석 100개')
        pk = res.data['id']
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.stock, self.magnet.price, self.magnet.pack_qty), (100, 9000, 100))
        history = StockHistory.objects.get(part=self.magnet)
        self.assertEqual(
            (history.kind, history.qty, history.expense_id, history.note), ('buy', 100, pk, '지출 · 자석 100개')
        )
        self.assertEqual(history.date, datetime.date(2026, 10, 3))

        # 고치면 차이만
        res = self.patch(pk, lines=[{'id': res.data['lines'][0]['id'], 'part': self.magnet.pk, 'qty': 150}])
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.stock, self.magnet.pack_qty), (150, 150))
        self.assertEqual(list(StockHistory.objects.filter(part=self.magnet).values_list('qty', flat=True)), [50, 100])

        # 지우면 되돌림
        self.client.delete(f'{API}/expenses/{pk}/')
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.stock, 0)
        self.assertEqual(StockHistory.objects.filter(part=self.magnet).first().note, '지출 삭제 · 자석 100개')

    def test_latest_purchase_only(self, _):
        """더 늦은 구매가 있으면 단가는 그대로. 최근 구매를 지우면 남은 최근 구매로 되돌림"""
        old = self.post('part', 12000, [{'part': self.magnet.pk, 'qty': 200}], date='2026-06-03', name='6월')
        new = self.post('part', 8000, [{'part': self.magnet.pk, 'qty': 100}], date='2026-10-03', name='10월')
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.price, self.magnet.pack_qty), (8000, 100))

        self.patch(
            old.data['id'], amount=13000, lines=[{'id': old.data['lines'][0]['id'], 'part': self.magnet.pk, 'qty': 200}]
        )
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.price, 8000)  # 6월 구매는 최근 구매가 아님

        part = self.client.get(f'{API}/parts/{self.magnet.pk}/').data
        self.assertEqual(
            part['last_buy'], {'expense': new.data['id'], 'date': datetime.date(2026, 10, 3), 'name': '10월'}
        )

        self.client.delete(f'{API}/expenses/{new.data["id"]}/')
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.price, self.magnet.pack_qty), (13000, 200))

    def test_unchanged_lines_keep_manual_price(self, _):
        """구매 줄이 그대로면 손으로 고친 단가는 그대로 (다음 구매 때 덮어씀)"""
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 4}])
        Color.objects.filter(pk=self.white.pk).update(price=17000)
        self.patch(
            res.data['id'], note='메모만', lines=[{'id': res.data['lines'][0]['id'], 'color': self.white.pk, 'qty': 4}]
        )
        self.refresh(self.white)
        self.assertEqual(self.white.price, 17000)
        color = self.client.get(f'{API}/colors/{self.white.pk}/').data
        self.assertEqual(color['last_buy']['name'], '구매')

    def test_empty_lines_and_category_change(self, _):
        """구매 줄은 비워도 저장. 분류를 바꾸면 구매 줄은 지워지고 늘린 수량은 되돌림"""
        res = self.post('supply', 9800, [], name='윤활유')
        self.assertEqual((res.status_code, res.data['lines']), (201, []))

        res = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        res = self.patch(res.data['id'], category='etc')
        self.assertEqual(res.data['lines'], [])
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.stock, 0)

    def test_invalid_lines(self, _):
        cases = [
            (
                'invest',
                [{'part': self.magnet.pk, 'qty': 1}],
                ['구매 줄은 필라멘트 · 부속품 · 포장재 · 소모품 지출에만 적어요.'],
            ),
            ('part', [{'part': self.box.pk, 'qty': 1}], [{'part': ['부속품 탭의 품목만 고를 수 있습니다.']}]),
            ('part', [{'color': self.white.pk, 'qty': 1}], [{'part': ['품목을 고르세요.']}]),
            ('filament', [{'part': self.magnet.pk, 'qty': 1}], [{'color': ['색상을 고르세요.']}]),
            ('filament', [{'color': self.white.pk, 'qty': 1.5}], [{'color': [], 'qty': ['통 수는 정수로 적으세요.']}]),
            (
                'part',
                [{'part': self.magnet.pk, 'qty': 1}, {'part': self.bolt.pk, 'qty': 1}],
                ['여러 가지면 줄마다 금액을 적으세요.'],
            ),
            (
                'part',
                [{'part': self.magnet.pk, 'qty': 1, 'amount': 6000}, {'part': self.magnet.pk, 'qty': 1, 'amount': 1}],
                [{}, {'part': ['같은 것이 두 줄 있습니다.']}],
            ),
            ('part', [{'part': self.magnet.pk, 'qty': 1, 'amount': 20000}], ['줄 금액 합계가 지출 금액보다 큽니다.']),
        ]
        for category, lines, errors in cases:
            with self.subTest(category=category, lines=lines):
                res = self.post(category, 10000, lines)
                self.assertEqual(res.status_code, 400)
                got = res.data['lines']
                # 줄마다 오류면 첫 번째 칸만 비교 (DRF 가 빈 칸을 채우는 모양은 보지 않음)
                if isinstance(errors[-1], dict):
                    want = {k: v for k, v in errors[-1].items() if v}
                    self.assertEqual({k: got[len(errors) - 1][k] for k in want}, want)
                else:
                    self.assertEqual(got, errors)
        self.assertFalse(Expense.objects.exists())
        self.assertFalse(ExpenseLine.objects.exists())

    def test_line_of_other_expense(self, _):
        a = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        b = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        res = self.patch(b.data['id'], lines=[{'id': a.data['lines'][0]['id'], 'part': self.magnet.pk, 'qty': 1}])
        self.assertEqual(res.data['lines'][0]['id'], ['이 지출의 구매 줄이 아닙니다.'])
        self.assertEqual(Decimal(ExpenseLine.objects.get(pk=a.data['lines'][0]['id']).qty), 100)
