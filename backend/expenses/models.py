"""지출 장부 모델 — docs/ERD.md 기준.

반복 지출(RecurringExpense) → 지출(Expense) → 구매 줄(ExpenseLine → 색상 · 재고 품목, v2 TBD-31).
반복 지출은 저절로 지출을 만들지 않고, 화면에서 확인하고 넣는다 (EXP-04)
분류는 고정 8개 (EXP-03). v2 손익이 분류로 계산하므로 사용자가 추가 · 수정하지 않는다
"""

import calendar
import datetime
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from filaments.models import MONEY
from stock.models import PartKind, qty_field


class ExpenseCategory(models.TextChoices):
    # 키는 v1.2.0 그대로 (기존 `부자재` 지출은 `부속품` 이 됨)
    # 부속품 · 포장재 · 소모품은 재고 관리 탭(PartKind)과 같은 키
    INVEST = 'invest', '장비'
    FILAMENT = 'filament', '필라멘트'
    PART = 'part', '부속품'
    PACK = 'pack', '포장재'
    SUPPLY = 'supply', '소모품'
    SUBSCRIPTION = 'sub', '구독 · 운영'
    SELLING = 'sell', '판매비'
    ETC = 'etc', '기타'


def category_field():
    return models.CharField('분류', max_length=10, choices=ExpenseCategory.choices)


class RecurringExpense(models.Model):
    """매달 같은 금액이 나가는 것 (구독 · 월정액). 그만 낼 때는 삭제 — 이미 넣은 지출은 남는다"""

    name = models.CharField('이름', max_length=100)
    category = category_field()
    amount = models.DecimalField('금액', **{**MONEY, 'validators': [MinValueValidator(1)]})
    day = models.PositiveSmallIntegerField('결제일', validators=[MinValueValidator(1), MaxValueValidator(31)])
    # 시작 달. 날짜는 항상 1일로 저장 (save)
    start = models.DateField('시작 달')
    note = models.TextField('메모', blank=True)

    class Meta:
        verbose_name = '반복 지출'
        verbose_name_plural = '반복 지출'
        ordering = ['day', 'name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.start = self.start.replace(day=1)
        super().save(*args, **kwargs)

    def pay_date(self, year, month):
        """그 달의 결제일. 결제일이 그 달 말일보다 크면 말일 (31일 → 2월은 28일)"""
        return datetime.date(year, month, min(self.day, calendar.monthrange(year, month)[1]))


class Expense(models.Model):
    """지출 한 줄. 할부 · 묶음 구매도 결제 금액 그대로 한 줄 (실제로 빠져나간 날 기준)"""

    date = models.DateField('날짜', default=timezone.localdate)
    name = models.CharField('항목', max_length=100)
    category = category_field()
    amount = models.DecimalField('금액', **{**MONEY, 'validators': [MinValueValidator(1)]})
    shop = models.CharField('구매처', max_length=100, blank=True)
    note = models.TextField('메모', blank=True)
    # 반복 지출에서 넣은 줄이면 그 반복 지출. 반복 지출을 지워도 지출은 남는다
    recurring = models.ForeignKey(
        RecurringExpense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
        verbose_name='반복 지출',
    )
    created_at = models.DateTimeField('추가일', auto_now_add=True)

    class Meta:
        verbose_name = '지출'
        verbose_name_plural = '지출'
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.date} {self.name}'


# 구매 줄을 적는 분류 → 고를 수 있는 것. 필라멘트는 색상, 나머지는 같은 키의 재고 관리 탭 품목
BUY_PART_KINDS = {
    ExpenseCategory.PART: PartKind.PART,
    ExpenseCategory.PACK: PartKind.PACK,
    ExpenseCategory.SUPPLY: PartKind.SUPPLY,
}
BUY_CATEGORIES = {ExpenseCategory.FILAMENT, *BUY_PART_KINDS}


class ExpenseLine(models.Model):
    """지출의 구매 줄 (v2 TBD-31). 지출(주문) 한 줄 안에 산 것 여러 줄

    - 필라멘트 지출: 색상 · 통 수. 스풀은 재고 추가에서 이 줄을 골라 등록한다 (Spool.buy, 통 수까지)
    - 부속품 · 포장재 · 소모품 지출: 그 탭의 품목 · 수량. 저장하면 남은 수량 + 수량 (입출고 기록 `지출`)
    - 금액(amount)을 비우면 지출 총액(배송비 포함)에서 금액 적은 줄을 빼고 남은 돈을 나눠 넣는다 → total
    - 그 색상 · 품목의 최근 구매면 원가 계산표 단가(색상 가격 · 묶음 가격)가 이 줄 값이 된다
    """

    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='lines', verbose_name='지출')
    # 둘 중 하나만 (아래 constraints). 색상 · 품목을 지우면 그 구매 줄도 지워진다 (지출 금액은 그대로)
    color = models.ForeignKey(
        'filaments.Color',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='buy_lines',
        verbose_name='색상',
    )
    part = models.ForeignKey(
        'stock.Part',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='buy_lines',
        verbose_name='품목',
    )
    # 필라멘트는 통 수 (정수만 — 검사는 시리얼라이저)
    qty = qty_field('수량', validators=[MinValueValidator(Decimal('0.01'))])
    # 직접 적은 금액. 비우면 나눠 넣음
    amount = models.DecimalField('금액', null=True, blank=True, **MONEY)
    # 이 줄 금액 = 직접 적은 금액 또는 나눠 넣은 금액 (저장할 때 계산)
    total = models.DecimalField('줄 금액', max_digits=12, decimal_places=2, default=0)

    class Meta:
        verbose_name = '구매 줄'
        verbose_name_plural = '구매 줄'
        ordering = ['id']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(color__isnull=False, part__isnull=True)
                | models.Q(color__isnull=True, part__isnull=False),
                name='expense_line_color_or_part',
                violation_error_message='색상이나 품목 중 하나를 고르세요.',
            ),
        ]

    def __str__(self):
        return f'{self.color or self.part} × {self.qty}'

    @property
    def each(self):
        """1개(통)당 금액 = 줄 금액 ÷ 수량"""
        return self.total / self.qty
