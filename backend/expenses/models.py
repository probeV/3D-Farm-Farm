"""지출 장부 모델 — docs/ERD.md 기준.

반복 지출(RecurringExpense) → 지출(Expense). 반복 지출은 저절로 지출을 만들지 않고, 화면에서 확인하고 넣는다 (EXP-04)
분류는 고정 7개 (EXP-03). v2 손익이 분류로 계산하므로 사용자가 추가 · 수정하지 않는다
"""

import calendar
import datetime

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from filaments.models import MONEY


class ExpenseCategory(models.TextChoices):
    INVEST = 'invest', '투자(장비)'
    FILAMENT = 'filament', '필라멘트'
    PART = 'part', '부자재'
    SUPPLY = 'supply', '소모품 · 유지'
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
    url = models.URLField('주문 링크', max_length=500, blank=True)
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
