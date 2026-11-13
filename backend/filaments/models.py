"""필라멘트 재고 모델 — docs/ERD.md 기준.

회사(Brand) · 재질(Material) → 필라멘트(Filament) → 색상(Color) → 스풀(Spool)
"""

import os
import re
from functools import partial
from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models, transaction
from django.utils import timezone
from PIL import Image, ImageOps

# 금액은 원 단위, 무게는 g 단위
MONEY = dict(max_digits=10, decimal_places=0, validators=[MinValueValidator(0)])

HEX_RE = re.compile(r'^#?([0-9A-Fa-f]{6})$')
SPOOL_CODE_RE = re.compile(r'^[Ss](\d+)$')


def normalize_hex(value):
    """`F5F5F5` / `#f5f5f5` 를 `#F5F5F5` 로 맞춘다. 형식이 틀리면 ValidationError."""
    match = HEX_RE.match((value or '').strip())
    if not match:
        raise ValidationError('색상 코드는 #RRGGBB 형식이어야 합니다. (예: #F5F5F5)', code='invalid_hex')
    return '#' + match.group(1).upper()


def validate_hex(value):
    normalize_hex(value)


LOGO_MAX_PX = 256
LOGO_MAX_MB = 5


def validate_logo_size(file):
    if file.size > LOGO_MAX_MB * 1024 * 1024:
        raise ValidationError(f'이미지는 {LOGO_MAX_MB}MB 까지 올릴 수 있습니다.', code='logo_too_big')


LOGO_VALIDATORS = [
    FileExtensionValidator(['png', 'jpg', 'jpeg', 'webp'], message='png, jpg, webp 이미지만 올릴 수 있습니다.'),
    validate_logo_size,
]


def shrink_image(file, max_px=LOGO_MAX_PX):
    """비율을 유지해 max_px × max_px 안에 들어가게 줄인다 (작은 이미지는 그대로). 원래 형식(png/jpg/webp)으로 저장"""
    image = Image.open(file)
    image_format = image.format
    image = ImageOps.exif_transpose(image)  # 폰 사진의 회전 정보 반영
    image.thumbnail((max_px, max_px))
    if image_format == 'JPEG' and image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    buffer = BytesIO()
    image.save(buffer, format=image_format)
    return ContentFile(buffer.getvalue())


class ShrinkImageMixin(models.Model):
    """이미지 칸 하나(`image_field`)를 올릴 때 `image_max_px` 이내로 줄여 저장하고,
    바꾸거나 지우거나 행을 삭제하면 이전 파일도 지운다.
    관리자 화면 · API 어디서 올려도 같게 동작하도록 모델에서 처리한다."""

    image_field = ''
    image_max_px = LOGO_MAX_PX

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        field = getattr(self, self.image_field)
        old = None
        if self.pk:
            old = type(self).objects.filter(pk=self.pk).values_list(self.image_field, flat=True).first()
        # 새로 올린 파일 (아직 저장소에 쓰이지 않음) 이면 줄여서 바꿔 넣는다
        if field and not field._committed:
            field.save(os.path.basename(field.name), shrink_image(field, self.image_max_px), save=False)
        super().save(*args, **kwargs)
        if old and old != field.name:
            self._delete_file_after_commit(old)

    def delete(self, *args, **kwargs):
        name = getattr(self, self.image_field).name
        result = super().delete(*args, **kwargs)  # 다른 데이터가 쓰고 있으면 여기서 ProtectedError → 파일은 그대로
        if name:
            self._delete_file_after_commit(name)
        return result

    def _delete_file_after_commit(self, name):
        # DB 저장이 확정된 뒤에 지운다 (중간에 실패해서 되돌려지면 파일은 남아 있어야 하므로)
        transaction.on_commit(partial(getattr(self, self.image_field).storage.delete, name))


class Brand(ShrinkImageMixin):
    """필라멘트 회사 (Bambu Lab, Esun …). 대표 이미지(로고)는 256×256 이내로 줄여 저장 (ShrinkImageMixin)"""

    image_field = 'logo'

    name = models.CharField('이름', max_length=50, unique=True)
    logo = models.ImageField('대표 이미지', upload_to='brands/', blank=True, validators=LOGO_VALIDATORS)

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
                violation_error_message='같은 회사·재질·시리즈의 필라멘트가 이미 있습니다.',
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
                violation_error_message='이 필라멘트에 같은 이름의 색상이 이미 있습니다.',
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


class SpoolNumber(models.Model):
    """지금까지 쓴 가장 큰 스풀 번호 (v2 TBD-33 · 18). 항상 1행 (pk=1)

    지운 스풀의 번호를 다시 쓰지 않으려고 따로 기억한다 — 라벨을 붙였다가 지운 스풀의 번호가
    다른 스풀에 다시 붙지 않게. 새 번호는 Spool.take_code_nos() 로만 받는다
    """

    last = models.PositiveIntegerField('지금까지 쓴 가장 큰 번호', default=0)

    class Meta:
        verbose_name = '스풀 번호'
        verbose_name_plural = '스풀 번호'

    def __str__(self):
        return f'S{self.last:05d}'

    @classmethod
    def remember(cls, code_no):
        """이 번호까지 썼다고 기억 (되돌리기로 다시 만든 스풀처럼 번호를 직접 정한 경우)"""
        cls.objects.get_or_create(pk=1)
        cls.objects.filter(pk=1, last__lt=code_no).update(last=code_no)


class Spool(models.Model):
    """스풀 1개 = 1행

    스풀 코드(S00012)는 사용자·라벨용 식별자라서 DB id 와 따로 `code_no` 로 관리한다.
    id 는 DB 사정(이전·재생성)으로 바뀔 수 있지만, 라벨에 찍힌 코드는 바뀌면 안 되기 때문.
    번호는 비우면 자동 — 지금까지 쓴 가장 큰 번호 + 1 (지운 번호는 다시 쓰지 않음, SpoolNumber).
    직접 지정은 되돌리기(지운 스풀을 같은 번호로 다시 만들기)용 (중복 불가).
    """

    class Status(models.TextChoices):
        SEALED = 'sealed', '재고'
        OPEN = 'open', '사용 중'
        EMPTY = 'empty', '사용 완료'

    # 색상을 지우면 그 색상의 스풀도 함께 삭제 (화면에서 개수를 보여 주고 2차 확인, PRD FIL-09)
    color = models.ForeignKey(Color, on_delete=models.CASCADE, related_name='spools', verbose_name='색상')
    code_no = models.PositiveIntegerField(
        '스풀 번호',
        unique=True,
        blank=True,  # 비우면 save() 가 다음 번호를 붙인다
        validators=[MinValueValidator(1)],
        help_text='비우면 다음 번호를 자동으로 붙여요.',
        error_messages={'unique': '이미 쓰고 있는 스풀 번호입니다.'},
    )
    status = models.CharField('상태', max_length=10, choices=Status.choices, default=Status.SEALED)
    price = models.DecimalField('구매가', null=True, blank=True, **MONEY)
    purchased_at = models.DateField('구매일', default=timezone.localdate)
    # 지출의 구매 항목 (v2 TBD-31 · 33). 필라멘트 지출을 저장하면 생긴 스풀이 그 항목을 가리킴 (지출 → 스풀 한 방향)
    buy = models.ForeignKey(
        'expenses.ExpenseItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='spools',
        verbose_name='주문(구매 항목)',
    )
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

    def save(self, *args, **kwargs):
        if self.code_no is None:
            self.code_no = self.take_code_nos(1)[0]
        else:
            SpoolNumber.remember(self.code_no)
        super().save(*args, **kwargs)

    @property
    def code(self):
        """S + 스풀 번호 (최소 5자리, 넘치면 늘어남): 12 → S00012, 123456 → S123456. 번호 전에는 None"""
        return None if self.code_no is None else f'S{self.code_no:05d}'

    @staticmethod
    def next_code_no():
        """다음 번호 (받아 가지는 않음) = 지금까지 쓴 가장 큰 번호 · 지금 있는 가장 큰 번호 중 큰 것 + 1"""
        largest = Spool.objects.aggregate(largest=models.Max('code_no'))['largest'] or 0
        last = SpoolNumber.objects.filter(pk=1).values_list('last', flat=True).first() or 0
        return max(largest, last) + 1

    @staticmethod
    @transaction.atomic
    def take_code_nos(count):
        """새 번호 count 개를 받는다 (다음 번호부터 이어서) → [번호, …]. 받은 번호는 지워도 다시 쓰지 않는다.
        bulk_create 는 save() 를 거치지 않으므로 여러 개를 만들 때는 이걸로 번호를 받아 넣는다"""
        start = Spool.next_code_no()
        numbers = list(range(start, start + count))
        if numbers:
            SpoolNumber.remember(numbers[-1])
        return numbers

    @staticmethod
    def code_no_from_code(code):
        """스풀 코드를 번호로: `S00012` / `s12` → 12. 형식이 틀리면 ValueError"""
        match = SPOOL_CODE_RE.match((code or '').strip())
        if not match:
            raise ValueError(f'스풀 코드 형식이 아닙니다: {code!r} (예: S00012)')
        return int(match.group(1))

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
