import datetime
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase

from filaments.models import Brand, Color, Filament, Material, Spool
from stock.models import Part, PartKind

from ..models import Expense, ExpenseCategory, ExpenseLine, RecurringExpense


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


class ExpenseLineTests(TestCase):
    """구매 줄 (v2 TBD-31) — 색상이나 품목 중 하나, 지우면 함께 / 스풀은 연결만 끊김"""

    def setUp(self):
        filament = Filament.objects.create(
            brand=Brand.objects.create(name='Bambu Lab'), material=Material.objects.create(name='PLA')
        )
        self.color = Color.objects.create(filament=filament, name='화이트', hex='#F5F5F5')
        self.part = Part.objects.create(kind=PartKind.PART, name='자석')
        self.expense = Expense.objects.create(
            date=datetime.date(2026, 9, 22), name='PLA 6롤', category=ExpenseCategory.FILAMENT, amount=Decimal('108000')
        )

    def test_color_or_part(self):
        for color, part in [(None, None), (self.color, self.part)]:
            with self.subTest(color=color, part=part), self.assertRaises(IntegrityError), transaction.atomic():
                ExpenseLine.objects.create(expense=self.expense, color=color, part=part, qty=1)

    def test_each(self):
        line = ExpenseLine.objects.create(expense=self.expense, color=self.color, qty=4, total=Decimal('72000'))
        self.assertEqual(line.each, 18000)

    def test_delete_expense_keeps_spool(self):
        line = ExpenseLine.objects.create(expense=self.expense, color=self.color, qty=4, total=Decimal('72000'))
        spool = Spool.objects.create(color=self.color, price=18000, buy=line)
        self.expense.delete()
        spool.refresh_from_db()
        self.assertEqual((spool.buy, spool.price), (None, 18000))
        self.assertFalse(ExpenseLine.objects.exists())

    def test_delete_color_deletes_line(self):
        ExpenseLine.objects.create(expense=self.expense, color=self.color, qty=4)
        self.color.delete()
        self.assertFalse(ExpenseLine.objects.exists())
        self.assertTrue(Expense.objects.exists())
