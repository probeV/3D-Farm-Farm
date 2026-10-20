"""필라멘트 재고 모델 — docs/ERD.md 기준.

회사(Brand) · 재질(Material) → 필라멘트(Filament) → 색상(Color) → 스풀(Spool)
"""

import re

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.utils import timezone

# 금액은 원 단위, 무게는 g 단위
MONEY = dict(max_digits=10, decimal_places=0, validators=[MinValueValidator(0)])

HEX_RE = re.compile(r'^#?([0-9A-Fa-f]{6})$')


def normalize_hex(value):
    """`F5F5F5` / `#f5f5f5` 를 `#F5F5F5` 로 맞춘다. 형식이 틀리면 ValidationError."""
    match = HEX_RE.match((value or '').strip())
    if not match:
        raise ValidationError('색상 코드는 #RRGGBB 형식이어야 해요. (예: #F5F5F5)', code='invalid_hex')
    return '#' + match.group(1).upper()


def validate_hex(value):
    normalize_hex(value)


class Brand(models.Model):
    """필라멘트 회사 (Bambu Lab, Esun …)"""

    name = models.CharField('이름', max_length=50, unique=True)
    logo = models.ImageField('대표 이미지', upload_to='brands/', blank=True)

    class Meta:
        verbose_name = '회사'
        verbose_name_plural = '회사'
        ordering = ['name']

    def __str__(self):
        return self.name


class Material(models.Model):
    """재질. 회사와 상관없는 공통 목록 (PLA, PETG, PETG-CF …)"""

    name = models.CharField('이름', max_length=50, unique=True)

    class Meta:
        verbose_name = '재질'
        verbose_name_plural = '재질'
        ordering = ['name']

    def __str__(self):
        return self.name


class Filament(models.Model):
    """회사 + 재질 + 시리즈 단위의 필라멘트 제품"""

    brand = models.ForeignKey(Brand, on_delete=models.PROTECT, related_name='filaments', verbose_name='회사')
    material = models.ForeignKey(Material, on_delete=models.PROTECT, related_name='filaments', verbose_name='재질')
    # NULL 대신 "" — 시리즈 없는 필라멘트도 UNIQUE 조합으로 중복 검사되도록
    series = models.CharField('시리즈', max_length=50, blank=True, default='')
    price = models.DecimalField('스풀 가격', null=True, blank=True, **MONEY)
    spool_g = models.DecimalField(
        '스풀 무게(g)',
        max_digits=7,
        decimal_places=1,
        default=1000,
        validators=[MinValueValidator(1)],
    )

    class Meta:
        verbose_name = '필라멘트'
        verbose_name_plural = '필라멘트'
        ordering = ['brand__name', 'material__name', 'series']
        constraints = [
            models.UniqueConstraint(
                fields=['brand', 'material', 'series'],
                name='unique_filament',
                violation_error_message='같은 회사·재질·시리즈의 필라멘트가 이미 있어요.',
            ),
        ]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        """`Bambu Lab › PLA Matte`, 시리즈가 없으면 `Esun › PETG`"""
        name = f'{self.material.name} {self.series}'.strip()
        return f'{self.brand.name} › {name}'


class Color(models.Model):
    """필라멘트 안의 색상. 재고는 색상 단위로 센다."""

    filament = models.ForeignKey(Filament, on_delete=models.PROTECT, related_name='colors', verbose_name='필라멘트')
    name = models.CharField('이름', max_length=50)
    hex = models.CharField('색상 코드', max_length=7, validators=[validate_hex])
    # 비우면 필라멘트 가격을 따름
    price = models.DecimalField('가격', null=True, blank=True, **MONEY)

    class Meta:
        verbose_name = '색상'
        verbose_name_plural = '색상'
        ordering = ['filament_id', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['filament', 'name'],
                name='unique_color_name',
                violation_error_message='이 필라멘트에 같은 이름의 색상이 이미 있어요.',
            ),
        ]

    def __str__(self):
        return f'{self.filament} · {self.name}'

    def save(self, *args, **kwargs):
        self.hex = normalize_hex(self.hex)
        super().save(*args, **kwargs)

    @property
    def spool_price(self):
        """색상 가격이 있으면 그 값, 없으면 필라멘트 가격 (둘 다 없으면 None)"""
        return self.price if self.price is not None else self.filament.price

    @property
    def price_per_g(self):
        price = self.spool_price
        return None if price is None else price / self.filament.spool_g


class Spool(models.Model):
    """스풀 1개 = 1행"""

    class Status(models.TextChoices):
        SEALED = 'sealed', '재고'
        OPEN = 'open', '사용 중'
        EMPTY = 'empty', '사용 완료'

    color = models.ForeignKey(Color, on_delete=models.PROTECT, related_name='spools', verbose_name='색상')
    # 저장 직후 id 로 만든다: S + id 5자리 (S00001)
    code = models.CharField('스풀 코드', max_length=10, unique=True, null=True, blank=True, editable=False)
    status = models.CharField('상태', max_length=10, choices=Status.choices, default=Status.SEALED)
    price = models.DecimalField('구매가', null=True, blank=True, **MONEY)
    purchased_at = models.DateField('구매일', default=timezone.localdate)
    opened_at = models.DateTimeField('사용 시작일', null=True, blank=True)
    finished_at = models.DateTimeField('사용 완료일', null=True, blank=True)
    note = models.TextField('메모', blank=True)

    class Meta:
        verbose_name = '스풀'
        verbose_name_plural = '스풀'
        ordering = ['id']
        indexes = [models.Index(fields=['color', 'status'], name='spool_color_status')]

    def __str__(self):
        return self.code or '(새 스풀)'

    @transaction.atomic
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.code:
            self.code = f'S{self.pk:05d}'
            super().save(update_fields=['code'])

    def set_status(self, status, now=None):
        """상태를 바꾸고 날짜 규칙(PRD 3.4)을 적용한다. 저장은 하지 않는다.

        재고: 시작일·완료일 지움 / 사용 중: 시작일 없으면 지금, 완료일 지움 / 사용 완료: 시작일 없으면 지금, 완료일 지금
        """
        now = now or timezone.now()
        status = self.Status(status)
        if status == self.Status.SEALED:
            self.opened_at = None
            self.finished_at = None
        elif status == self.Status.OPEN:
            self.opened_at = self.opened_at or now
            self.finished_at = None
        else:
            self.opened_at = self.opened_at or now
            self.finished_at = now
        self.status = status
