import datetime
from decimal import Decimal
from unittest import mock

from rest_framework.test import APITestCase

from ..models import Expense, RecurringExpense

API = '/api/v0'
TODAY = datetime.date(2026, 10, 28)


@mock.patch('django.utils.timezone.localdate', return_value=TODAY)
class ExpenseApiTests(APITestCase):
    def setUp(self):
        self.ai = RecurringExpense.objects.create(
            name='AI 구독', category='sub', amount=Decimal('29000'), day=5, start=datetime.date(2026, 6, 1)
        )

    def body(self, **kwargs):
        return {'date': '2026-10-10', 'name': '필라멘트 건조기', 'category': 'invest', 'amount': 89000, **kwargs}

    def test_list_newest_first(self, _):
        Expense.objects.create(date=datetime.date(2026, 5, 11), name='3D 프린터', category='invest', amount=1090000)
        Expense.objects.create(date=datetime.date(2026, 9, 8), name='소형 박스', category='part', amount=22000)
        res = self.client.get(f'{API}/expenses/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([e['name'] for e in res.data], ['소형 박스', '3D 프린터'])
        self.assertEqual(res.data[1]['amount'], 1090000)

    def test_create_update_delete(self, _):
        res = self.client.post(f'{API}/expenses/', self.body(url='https://example.com/order/1'), format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['category'], res.data['recurring']), ('invest', None))
        pk = res.data['id']
        res = self.client.patch(f'{API}/expenses/{pk}/', {'amount': 79000}, format='json')
        self.assertEqual(res.data['amount'], 79000)
        self.assertEqual(self.client.delete(f'{API}/expenses/{pk}/').status_code, 204)
        self.assertFalse(Expense.objects.exists())

    def test_invalid_fields(self, _):
        cases = [
            ({'category': 'tax'}, 'category', '없는 분류입니다.'),
            ({'date': '2026-10-29'}, 'date', '오늘 이후 날짜는 넣을 수 없습니다.'),
            ({'url': 'example'}, 'url', 'https:// 로 시작하는 주소로 입력하세요.'),
        ]
        for patch, field, message in cases:
            with self.subTest(field=field):
                res = self.client.post(f'{API}/expenses/', self.body(**patch), format='json')
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.data[field], [message])
        res = self.client.post(f'{API}/expenses/', self.body(amount=0), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('amount', res.data)

    def test_add_recurring_rows_at_once(self, _):
        tool = RecurringExpense.objects.create(
            name='모델링 툴', category='sub', amount=Decimal('15000'), day=12, start=datetime.date(2026, 7, 1)
        )
        rows = [
            self.body(date='2026-10-05', name='AI 구독', category='sub', amount=29000, recurring=self.ai.pk),
            self.body(date='2026-10-12', name='모델링 툴', category='sub', amount=16500, recurring=tool.pk),
        ]
        res = self.client.post(f'{API}/expenses/', rows, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual([r['amount'] for r in res.data], [29000, 16500])
        self.assertEqual(Expense.objects.filter(recurring__isnull=False).count(), 2)

    def test_same_recurring_twice_in_month_is_rejected(self, _):
        row = self.body(date='2026-10-05', name='AI 구독', category='sub', amount=29000, recurring=self.ai.pk)
        # 한 번에 두 줄
        res = self.client.post(f'{API}/expenses/', [row, {**row, 'date': '2026-10-06'}], format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Expense.objects.exists())
        # 이미 넣은 달에 또
        self.assertEqual(self.client.post(f'{API}/expenses/', row, format='json').status_code, 201)
        res = self.client.post(f'{API}/expenses/', {**row, 'date': '2026-10-20'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['recurring'], ['이 달에 이미 넣은 반복 지출입니다.'])
        # 다음 달은 괜찮음 (날짜만 9월로 — 오늘 이후는 안 되므로 지난달로 확인)
        res = self.client.post(f'{API}/expenses/', {**row, 'date': '2026-09-05'}, format='json')
        self.assertEqual(res.status_code, 201)

    def test_bulk_rolls_back_when_one_row_is_invalid(self, _):
        rows = [self.body(), self.body(category='tax')]
        res = self.client.post(f'{API}/expenses/', rows, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Expense.objects.exists())


class RecurringExpenseApiTests(APITestCase):
    def test_crud_with_expense_count(self):
        res = self.client.post(
            f'{API}/recurring-expenses/',
            {'name': 'AI 구독', 'category': 'sub', 'amount': 29000, 'day': 5, 'start': '2026-06-17'},
            format='json',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual((res.data['start'], res.data['expense_count']), ('2026-06-01', 0))
        pk = res.data['id']
        Expense.objects.create(
            date=datetime.date(2026, 6, 5), name='AI 구독', category='sub', amount=29000, recurring_id=pk
        )
        res = self.client.get(f'{API}/recurring-expenses/')
        self.assertEqual([(r['name'], r['expense_count']) for r in res.data], [('AI 구독', 1)])
        # 지워도 넣은 지출은 남음
        self.assertEqual(self.client.delete(f'{API}/recurring-expenses/{pk}/').status_code, 204)
        self.assertEqual(Expense.objects.get().recurring, None)

    def test_day_range(self):
        for day in [0, 32]:
            with self.subTest(day=day):
                res = self.client.post(
                    f'{API}/recurring-expenses/',
                    {'name': 'x', 'category': 'sub', 'amount': 1000, 'day': day, 'start': '2026-06-01'},
                    format='json',
                )
                self.assertEqual(res.status_code, 400)
                self.assertIn('day', res.data)
