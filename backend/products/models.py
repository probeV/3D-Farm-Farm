"""제품 원가 모델 — docs/ERD.md 기준.

카테고리(Category) → 세부 분류(Subcategory) · 제품(Product)
제품 → 사용 필라멘트(ProductFilament, filaments 앱의 Filament · Color) · 사용 부자재(ProductPart → Part)
원가 계산 설정값은 CostSetting 1개 행
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from filaments.models import MONEY, Color, Filament


def percent(**kwargs):
    """0 ~ 100 % 값 (1.98 = 1.98%)"""
    return models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        **kwargs,
    )


class Category(models.Model):
    """제품 카테고리 (수업 교구, 퍼즐 …)"""

    name = models.CharField('이름', max_length=50, unique=True)

    class Meta:
        verbose_name = '카테고리'
        verbose_name_plural = '카테고리'
        ordering = ['name']

    def __str__(self):
        return self.name


class Subcategory(models.Model):
    """카테고리 안의 세부 분류 (수업 교구 › 수학 …)"""

    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name='subcategories', verbose_name='카테고리'
    )
    name = models.CharField('이름', max_length=50)

    class Meta:
        verbose_name = '세부 분류'
        verbose_name_plural = '세부 분류'
        ordering = ['category__name', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'name'],
                name='unique_subcategory_name',
                violation_error_message='이 카테고리에 같은 이름의 세부 분류가 이미 있습니다.',
            ),
        ]

    def __str__(self):
        return f'{self.category} › {self.name}'


class Part(models.Model):
    """부자재 (자석, 나사, 포장재 …). 묶음 구매가 ÷ 묶음 수량 = 개당 단가"""

    name = models.CharField('품목', max_length=100)
    shop = models.CharField('회사/구매처', max_length=100, blank=True)
    price = models.DecimalField('묶음 구매가', null=True, blank=True, **MONEY)
    pack_qty = models.DecimalField(
        '묶음 수량',
        max_digits=10,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    unit = models.CharField('단위', max_length=10, default='개')
    note = models.TextField('메모', blank=True)

    class Meta:
        verbose_name = '부자재'
        verbose_name_plural = '부자재'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def unit_price(self):
        """개당 단가. 구매가가 없으면 None"""
        return None if self.price is None else self.price / self.pack_qty


class Product(models.Model):
    """판매 제품. 카테고리 · 세부 분류는 비워도 됨 (미분류)

    No.(no) 는 숫자로 저장하고 그대로 1, 2, 3 … 으로 보여 준다. 비우면 지금 있는 가장 큰 번호 + 1.
    """

    class Status(models.TextChoices):
        ON_SALE = 'on_sale', '판매중'
        DEVELOPING = 'developing', '개발중'
        DISCONTINUED = 'discontinued', '판매중지'

    no = models.PositiveIntegerField(
        'No.',
        unique=True,
        blank=True,  # 비우면 save() 가 다음 번호를 붙인다
        validators=[MinValueValidator(1)],
        help_text='비우면 다음 번호를 자동으로 붙여요.',
        error_messages={'unique': '이미 쓰고 있는 No. 입니다.'},
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='products',
        verbose_name='카테고리',
    )
    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='products',
        verbose_name='세부 분류',
    )
    name = models.CharField('제품명', max_length=100)
    print_minutes = models.PositiveIntegerField('출력 시간(분)', null=True, blank=True)
    sale_price = models.DecimalField('판매가', null=True, blank=True, **MONEY)
    status = models.CharField('상태', max_length=20, choices=Status.choices, default=Status.DEVELOPING)
    note = models.TextField('메모', blank=True)
    created_at = models.DateTimeField('추가일', auto_now_add=True)
    updated_at = models.DateTimeField('수정일', auto_now=True)

    class Meta:
        verbose_name = '제품'
        verbose_name_plural = '제품'
        ordering = ['no']

    def __str__(self):
        return self.name if self.no is None else f'{self.no}. {self.name}'

    def save(self, *args, **kwargs):
        if self.no is None:
            self.no = self.next_no()
        super().save(*args, **kwargs)

    def clean(self):
        # 세부 분류는 그 제품의 카테고리 안에서 골라야 한다 (카테고리 없이 세부 분류만 고를 수도 없음)
        if self.subcategory_id and self.subcategory.category_id != self.category_id:
            raise ValidationError({'subcategory': '세부 분류는 고른 카테고리 안에서 골라야 합니다.'})

    @staticmethod
    def next_no():
        """지금 있는 가장 큰 번호 + 1"""
        largest = Product.objects.aggregate(largest=models.Max('no'))['largest']
        return (largest or 0) + 1


class ProductFilament(models.Model):
    """제품 ↔ 필라멘트 + 사용량 + 색상(선택). 같은 필라멘트를 색상별로 여러 줄 둘 수 있다."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='filaments', verbose_name='제품')
    filament = models.ForeignKey(
        Filament, on_delete=models.PROTECT, related_name='product_filaments', verbose_name='필라멘트'
    )
    # 색상을 지우면 이 줄은 색상 선택 안 함 → 필라멘트 가격으로 계산 (TBD-04)
    color = models.ForeignKey(
        Color,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_filaments',
        verbose_name='색상',
    )
    grams = models.DecimalField(
        '사용량(g)', max_digits=7, decimal_places=1, default=0, validators=[MinValueValidator(0)]
    )

    class Meta:
        verbose_name = '사용 필라멘트'
        verbose_name_plural = '사용 필라멘트'
        ordering = ['id']

    def __str__(self):
        color = f' · {self.color.name}' if self.color_id else ''
        return f'{self.filament}{color} {self.grams}g'

    def clean(self):
        if self.color_id and self.filament_id and self.color.filament_id != self.filament_id:
            raise ValidationError({'color': '색상은 고른 필라멘트의 색상이어야 합니다.'})

    @property
    def price_per_g(self):
        """색상을 골랐으면 그 색상 기준, 아니면 필라멘트 가격 기준. 가격이 없으면 None"""
        if self.color_id:
            return self.color.price_per_g
        price = self.filament.price
        return None if price is None else price / self.filament.spool_g


class ProductPart(models.Model):
    """제품 ↔ 부자재 + 수량"""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='parts', verbose_name='제품')
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='product_parts', verbose_name='부자재')
    qty = models.DecimalField('수량', max_digits=10, decimal_places=2, default=1, validators=[MinValueValidator(0)])

    class Meta:
        verbose_name = '사용 부자재'
        verbose_name_plural = '사용 부자재'
        ordering = ['id']

    def __str__(self):
        return f'{self.part} × {self.qty}'


class CostSetting(models.Model):
    """원가 계산 설정값 (PRD 3.8). 항상 1개 행 — `CostSetting.load()` 로 읽는다."""

    power_kw = models.DecimalField(
        '프린터 소비 전력(kW)',
        max_digits=6,
        decimal_places=3,
        default=Decimal('0.36'),
        validators=[MinValueValidator(0)],
    )
    elec_rate = models.DecimalField(
        '전기료 단가(원/kWh)', max_digits=8, decimal_places=1, default=215, validators=[MinValueValidator(0)]
    )
    printer_price = models.DecimalField('프린터 구매가', default=0, **MONEY)
    printer_life_hours = models.DecimalField(
        '프린터 예상 수명(시간)', max_digits=8, decimal_places=0, default=5000, validators=[MinValueValidator(1)]
    )
    failure_rate = percent(verbose_name='출력 실패율(%)', default=0)
    fee_order = percent(verbose_name='주문관리 수수료(%)', default=Decimal('1.98'))
    fee_sales = percent(verbose_name='판매 수수료(%)', default=Decimal('2.73'))
    shipping_cost = models.DecimalField('건당 판매자 부담 배송비', default=0, **MONEY)
    target_margin = percent(verbose_name='목표 마진율(%)', default=40)

    class Meta:
        verbose_name = '원가 설정'
        verbose_name_plural = '원가 설정'

    def __str__(self):
        return '원가 설정'

    def save(self, *args, **kwargs):
        self.pk = 1  # 항상 같은 행
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        """설정 행을 읽는다. 없으면 기본값으로 만든다"""
        setting, _ = cls.objects.get_or_create(pk=1)
        return setting
