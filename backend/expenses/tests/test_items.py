"""지출 구매 항목 (v2 TBD-31 · 33) — 항목 금액 나누기 · 남은 수량 · 평균 단가 · 필라멘트 스풀 자동 생성"""

import datetime
from decimal import Decimal
from unittest import mock

from rest_framework.test import APITestCase

from filaments.models import Brand, Color, Filament, Material, Spool
from stock.models import Part, PartKind, StockHistory

from ..models import Expense, ExpenseItem

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class ExpenseItemApiTests(APITestCase):
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
    def post(self, category, amount, items, date='2026-09-22', name='구매'):
        body = {'date': date, 'name': name, 'category': category, 'amount': amount, 'items': items}
        return self.client.post(f'{API}/expenses/', body, format='json')

    def patch(self, pk, **data):
        return self.client.patch(f'{API}/expenses/{pk}/', data, format='json')

    def refresh(self, *objs):
        for obj in objs:
            obj.refresh_from_db()

    def spools(self, **filters):
        return list(Spool.objects.filter(**filters).order_by('code_no'))

    # ---- 필라멘트: 항목 금액 · 스풀 자동 생성
    def test_filament_creates_spools(self, _):
        """금액을 비운 항목은 총액을 롤 수대로 나눔 → 롤 수만큼 스풀 (구매가 = 롤당 금액, 구매일 = 지출 날짜)"""
        res = self.post('filament', 108000, [{'color': self.white.pk, 'qty': 4}, {'color': self.black.pk, 'qty': 2}])
        self.assertEqual(res.status_code, 201, res.data)
        items = res.data['items']
        self.assertEqual(
            [(r['total'], r['each'], r['unit'], r['spools'], r['used']) for r in items],
            [(72000, 18000, '롤', 4, 0), (36000, 18000, '롤', 2, 0)],
        )
        self.assertEqual(items[0]['name'], 'Bambu Lab › PLA Basic · 화이트')
        made = self.spools()
        self.assertEqual([s.code for s in made], ['S00001', 'S00002', 'S00003', 'S00004', 'S00005', 'S00006'])
        self.assertEqual(
            {(s.status, s.price, s.purchased_at) for s in made}, {('sealed', 18000, datetime.date(2026, 9, 22))}
        )
        self.assertEqual([s.color_id for s in made], [self.white.pk] * 4 + [self.black.pk] * 2)
        # 원가 계산의 스풀 가격 = 보유 스풀 평균. 등록 가격(색상 가격)은 지출이 바꾸지 않음
        self.refresh(self.white, self.black)
        self.assertEqual((self.white.spool_price, self.black.spool_price), (18000, 18000))
        self.assertEqual((self.white.price, self.black.price), (14400, None))

    def test_fixed_amount_and_rest(self, _):
        """금액 적은 항목은 그대로, 남은 금액을 비운 항목에"""
        res = self.post(
            'filament', 50000, [{'color': self.white.pk, 'qty': 2, 'amount': 30000}, {'color': self.black.pk, 'qty': 1}]
        )
        self.assertEqual([r['total'] for r in res.data['items']], [30000, 20000])

    def test_same_color_items_average_price(self, _):
        """같은 색상 여러 항목 (화이트 9롤 + 할인 1롤) → 스풀은 항목마다 그 값, 원가 계산의 스풀 가격은 평균"""
        res = self.post(
            'filament',
            190000,
            [{'color': self.white.pk, 'qty': 9, 'amount': 180000}, {'color': self.white.pk, 'qty': 1, 'amount': 10000}],
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(sorted(s.price for s in self.spools()), [10000] + [20000] * 9)
        self.refresh(self.white)
        self.assertEqual(self.white.spool_price, 19000)

    def test_edit_syncs_spools_by_difference(self, _):
        """지출 → 스풀 한 방향, 차이만: 늘리면 새로, 줄이면 `재고` 스풀을 큰 번호부터 지움. 금액 · 날짜 · 색상도 맞춤"""
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 4}])
        pk, item = res.data['id'], res.data['items'][0]['id']

        # 스풀에서 분실로 하나 지움 → 지출을 고쳐도 다시 생기지 않음
        Spool.objects.get(code_no=2).delete()
        res = self.patch(pk, amount=100000, items=[{'id': item, 'color': self.white.pk, 'qty': 5}])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([s.code for s in self.spools()], ['S00001', 'S00003', 'S00004', 'S00005'])
        self.assertEqual({s.price for s in self.spools()}, {20000})  # 롤당 100000 ÷ 5

        res = self.patch(pk, date='2026-10-01', items=[{'id': item, 'color': self.black.pk, 'qty': 3}])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([s.code for s in self.spools()], ['S00001', 'S00003'])  # 5 → 3: 큰 번호부터 2개
        self.assertEqual(
            {(s.color_id, s.purchased_at) for s in self.spools()}, {(self.black.pk, datetime.date(2026, 10, 1))}
        )

        res = self.patch(pk, items=[{'id': item, 'color': self.black.pk, 'qty': 4}])
        self.assertEqual([s.code for s in self.spools()], ['S00001', 'S00003', 'S00006'])  # 지운 번호는 다시 안 씀

    def test_used_spools_guard(self, _):
        """사용한 스풀: 색상 변경 · 빼기 · 지출 삭제 막음, 롤 수는 `재고` 스풀이 있는 만큼만 줄이기"""
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 4}])
        pk, item = res.data['id'], res.data['items'][0]['id']
        Spool.objects.filter(code_no__in=[1, 2]).update(status=Spool.Status.OPEN)

        row = self.client.get(f'{API}/expenses/').data[0]['items'][0]
        self.assertEqual((row['spools'], row['used']), (4, 2))

        res = self.patch(pk, items=[{'id': item, 'color': self.white.pk, 'qty': 1}])
        self.assertEqual(res.data['items'][0]['qty'], ['재고 스풀이 2개라 2롤보다 적게 줄일 수 없습니다.'])
        res = self.patch(pk, items=[{'id': item, 'color': self.black.pk, 'qty': 4}])
        self.assertEqual(res.data['items'][0]['color'], ['사용한 스풀 2개가 있어 색상을 바꿀 수 없습니다.'])
        res = self.patch(pk, items=[])
        self.assertEqual(res.data['items'], ['사용한 스풀 2개가 있는 항목은 뺄 수 없습니다.'])
        res = self.patch(pk, category='etc')
        self.assertEqual(res.data['items'], ['사용한 스풀 2개가 있는 항목은 뺄 수 없습니다.'])
        res = self.client.delete(f'{API}/expenses/{pk}/')
        self.assertEqual((res.status_code, res.data['detail']), (409, '사용한 스풀 2개가 있어 삭제할 수 없습니다.'))

        res = self.patch(pk, items=[{'id': item, 'color': self.white.pk, 'qty': 2}])
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([s.code for s in self.spools()], ['S00001', 'S00002'])  # 사용한 스풀은 그대로

    def test_delete_and_drop_remove_sealed_spools(self, _):
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 2}, {'color': self.black.pk, 'qty': 2}])
        pk, white = res.data['id'], res.data['items'][0]['id']
        self.patch(pk, items=[{'id': white, 'color': self.white.pk, 'qty': 2}])  # 블랙 항목 빼기
        self.assertEqual({s.color_id for s in self.spools()}, {self.white.pk})
        self.assertEqual(self.client.delete(f'{API}/expenses/{pk}/').status_code, 204)
        self.assertEqual(self.spools(), [])

    def test_spool_price_locked(self, _):
        """지출로 생긴 스풀은 구매가를 스풀에서 못 고침 (상태 · 메모는 됨). 재고 추가로 넣은 스풀은 고칠 수 있음"""
        self.post('filament', 72000, [{'color': self.white.pk, 'qty': 1}])
        spool = self.spools()[0]
        res = self.client.patch(f'{API}/spools/{spool.pk}/', {'price': 10000}, format='json')
        self.assertEqual(res.data['price'], ['지출로 생긴 스풀은 구매가를 지출에서 고쳐요.'])
        res = self.client.patch(f'{API}/spools/{spool.pk}/', {'status': 'open', 'note': '메모'}, format='json')
        self.assertEqual(res.status_code, 200)
        other = Spool.objects.create(color=self.white, price=14400)
        res = self.client.patch(f'{API}/spools/{other.pk}/', {'price': 10000}, format='json')
        self.assertEqual(res.data['price'], 10000)

    def test_restore_deleted_spool_keeps_buy(self, _):
        """스풀 삭제 되돌리기: 같은 번호 · 주문으로 다시 만들 수 있음"""
        res = self.post('filament', 72000, [{'color': self.white.pk, 'qty': 1}])
        spool = self.spools()[0]
        body = {'code_no': spool.code_no, 'color': spool.color_id, 'price': 72000, 'buy': spool.buy_id}
        spool.delete()
        res = self.client.post(f'{API}/spools/', body, format='json')
        self.assertEqual((res.status_code, res.data['code'], res.data['buy']), (201, 'S00001', body['buy']))

    # ---- 부속품 · 포장재 · 소모품
    def test_part_stock_and_price(self, _):
        """저장하면 남은 수량 + 수량 (입출고 기록 `지출`), 평균 단가 = 항목 단가 (직접 넣은 구매가는 그대로)"""
        res = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}], date='2026-10-03', name='자석 100개')
        pk = res.data['id']
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.stock, self.magnet.avg_price, self.magnet.price), (100, 90, 12000))
        history = StockHistory.objects.get(part=self.magnet)
        self.assertEqual(
            (history.kind, history.qty, history.expense_id, history.note), ('buy', 100, pk, '지출 · 자석 100개')
        )

        # 고치면 차이만
        res = self.patch(pk, items=[{'id': res.data['items'][0]['id'], 'part': self.magnet.pk, 'qty': 150}])
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.stock, self.magnet.avg_price), (150, 60))  # 9000 ÷ 150

        # 지우면 되돌림
        self.client.delete(f'{API}/expenses/{pk}/')
        self.refresh(self.magnet)
        self.assertEqual((self.magnet.stock, self.magnet.avg_price), (0, None))
        self.assertEqual(StockHistory.objects.filter(part=self.magnet).first().note, '지출 삭제 · 자석 100개')

    def test_same_part_items(self, _):
        """같은 품목 여러 항목: 남은 수량은 합계만큼, 평균 단가는 합친 값"""
        self.post(
            'part',
            10000,
            [{'part': self.magnet.pk, 'qty': 100, 'amount': 6000}, {'part': self.magnet.pk, 'qty': 50, 'amount': 4000}],
        )
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.stock, 150)
        self.assertAlmostEqual(self.magnet.avg_price, Decimal('66.6667'))  # 10000 ÷ 150

    def test_bought_flag_and_average_of_all_purchases(self, _):
        """단가는 최근 구매가 아니라 평균 (6월 200개 12,000 + 10월 100개 8,000 → 66.67). 지운 구매는 빠짐"""
        self.post('part', 12000, [{'part': self.magnet.pk, 'qty': 200}], date='2026-06-03', name='6월')
        new = self.post('part', 8000, [{'part': self.magnet.pk, 'qty': 100}], date='2026-10-03', name='10월')
        part = self.client.get(f'{API}/parts/{self.magnet.pk}/').data
        self.assertEqual((part['bought'], part['unit_price'], part['price']), (True, 66.67, 12000))
        self.assertFalse(self.client.get(f'{API}/parts/{self.bolt.pk}/').data['bought'])

        self.client.delete(f'{API}/expenses/{new.data["id"]}/')
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.avg_price, 60)

    def test_empty_items_and_category_change(self, _):
        """구매 항목은 비워도 저장. 분류를 바꾸면 구매 항목은 지워지고 늘린 수량은 되돌림"""
        res = self.post('supply', 9800, [], name='윤활유')
        self.assertEqual((res.status_code, res.data['items']), (201, []))

        res = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        res = self.patch(res.data['id'], category='etc')
        self.assertEqual(res.data['items'], [])
        self.refresh(self.magnet)
        self.assertEqual(self.magnet.stock, 0)

    def test_invalid_items(self, _):
        cases = [
            (
                'invest',
                [{'part': self.magnet.pk, 'qty': 1}],
                ['구매 항목은 필라멘트 · 부속품 · 포장재 · 소모품 지출에만 적어요.'],
            ),
            ('part', [{'part': self.box.pk, 'qty': 1}], [{'part': ['부속품 탭의 품목만 고를 수 있습니다.']}]),
            ('part', [{'color': self.white.pk, 'qty': 1}], [{'part': ['품목을 고르세요.']}]),
            ('filament', [{'part': self.magnet.pk, 'qty': 1}], [{'color': ['색상을 고르세요.']}]),
            ('filament', [{'color': self.white.pk, 'qty': 1.5}], [{'qty': ['롤 수는 정수로 적으세요.']}]),
            (
                'part',
                [{'part': self.magnet.pk, 'qty': 1}, {'part': self.bolt.pk, 'qty': 1}],
                ['여러 가지면 항목마다 금액을 적으세요.'],
            ),
            ('part', [{'part': self.magnet.pk, 'qty': 1, 'amount': 20000}], ['항목 금액 합계가 지출 금액보다 큽니다.']),
        ]
        for category, items, errors in cases:
            with self.subTest(category=category, items=items):
                res = self.post(category, 10000, items)
                self.assertEqual(res.status_code, 400)
                got = res.data['items']
                if isinstance(errors[-1], dict):
                    want = errors[-1]
                    self.assertEqual({k: got[len(errors) - 1][k] for k in want}, want)
                else:
                    self.assertEqual(got, errors)
        self.assertFalse(Expense.objects.exists())
        self.assertFalse(ExpenseItem.objects.exists())
        self.assertFalse(Spool.objects.exists())

    def test_item_of_other_expense(self, _):
        a = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        b = self.post('part', 9000, [{'part': self.magnet.pk, 'qty': 100}])
        res = self.patch(b.data['id'], items=[{'id': a.data['items'][0]['id'], 'part': self.magnet.pk, 'qty': 1}])
        self.assertEqual(res.data['items'][0]['id'], ['이 지출의 구매 항목이 아닙니다.'])
