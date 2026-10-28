import datetime
from decimal import Decimal

from django.test import TestCase

from ..models import Expense, ExpenseCategory, RecurringExpense


class RecurringExpenseTests(TestCase):
    def make(self, **kwargs):
        return RecurringExpense.objects.create(
            name='AI 구독', category=ExpenseCategory.SUBSCRIPTION, amount=Decimal('29000'), **kwargs
        )

    def test_start_is_first_of_month(self):
        r = self.make(day=5, start=datetime.date(2026, 6, 17))
        self.assertEqual(r.start, datetime.date(2026, 6, 1))

    def test_pay_date_clamps_to_last_day(self):
        r = self.make(day=31, start=datetime.date(2026, 1, 1))
        self.assertEqual(r.pay_date(2026, 2), datetime.date(2026, 2, 28))
        self.assertEqual(r.pay_date(2028, 2), datetime.date(2028, 2, 29))
        self.assertEqual(r.pay_date(2026, 10), datetime.date(2026, 10, 31))

    def test_delete_keeps_expenses(self):
        r = self.make(day=5, start=datetime.date(2026, 6, 1))
        e = Expense.objects.create(
            date=datetime.date(2026, 6, 5), name='AI 구독', category=r.category, amount=r.amount, recurring=r
        )
        r.delete()
        e.refresh_from_db()
        self.assertIsNone(e.recurring)
