"""판매 장부 모델 — docs/ERD.md · docs/plans/v2.md SALE 기준.

판매(Sale) 한 건 = 주문 하나. 주문 안에 제품 여러 줄(SaleItem, SALE-04) · 포장 줄(SalePack, SALE-06).
배송비 · 수수료 · 포장은 주문 단위
판매를 저장하면 부속품(제품 × 수량)과 포장재(포장 줄)가 남은 수량에서 빠진다 (stock/services.py sync_sale)
판매처는 고정 3개. 손익(PL)이 판매가 · 수수료 · 정산 금액을 쓰고, 개당 원가는 주문별 이익(참고, SALE-05)에만 쓴다
"""

from decimal import ROUND_HALF_UP, Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

from filaments.models import MONEY
from products.models import CostSetting, Product
from stock.models import Part, qty_field


class SaleChannel(models.TextChoices):
    STORE = 'store', '스마트스토어'
    DIRECT = 'direct', '직접 판매'
    ETC = 'etc', '기타'


def won(value):
    """원 단위 반올림 (0.5 는 올림)"""
    return Decimal(value).quantize(Decimal('1'), rounding=ROUND_HALF_UP)


class Sale(models.Model):
    """판매 한 건 (주문). 정산 금액 = 판매가 합계 + 받은 배송비 − 수수료"""

    date = models.DateField('날짜', default=timezone.localdate)
    channel = models.CharField('판매처', max_length=10, choices=SaleChannel.choices, default=SaleChannel.STORE)
    # 스마트스토어 주문번호 등. 비어 있지 않으면 중복 불가 (스마트스토어 가져오기에서 같은 주문을 두 번 넣지 않게)
    order_no = models.CharField('주문번호', max_length=50, blank=True)
    shipping_received = models.DecimalField('받은 배송비', default=0, **MONEY)
    fee = models.DecimalField('수수료', default=0, **MONEY)
    # 판매자가 택배사에 낸 돈 — 주문별 이익(참고)에만. 손익은 지출 장부의 판매비를 쓴다
    shipping_cost = models.DecimalField('낸 택배비', default=0, **MONEY)
    note = models.TextField('메모', blank=True)
    created_at = models.DateTimeField('추가일', auto_now_add=True)

    class Meta:
        verbose_name = '판매'
        verbose_name_plural = '판매'
        ordering = ['-date', '-id']
        constraints = [
            models.UniqueConstraint(fields=['order_no'], condition=~Q(order_no=''), name='unique_sale_order_no'),
        ]

    def __str__(self):
        return f'{self.date} {self.get_channel_display()}' + (f' {self.order_no}' if self.order_no else '')

    @staticmethod
    def store_fee(gross, shipping_received, setting=None):
        """스마트스토어 수수료 (SALE-03) = (판매가 합계 + 받은 배송비) × (주문관리 + 판매 수수료%), 원 단위 반올림"""
        s = setting or CostSetting.load()
        return won((Decimal(gross) + Decimal(shipping_received)) * (s.fee_order + s.fee_sales) / 100)


class SaleItem(models.Model):
    """판매 안의 제품 한 줄. 제품을 지워도 줄은 남고, 팔 때 저장한 제품명으로 보인다"""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items', verbose_name='판매')
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sale_items',
        verbose_name='제품',
    )
    # 팔 때의 제품명. 비우면 저장할 때 제품의 이름으로 (save)
    product_name = models.CharField('제품명', max_length=100, blank=True)
    qty = models.PositiveIntegerField('수량', default=1, validators=[MinValueValidator(1)])
    unit_price = models.DecimalField('단가', **MONEY)
    # 팔 때 원가 계산표에서 복사한 개당 원가 (SALE-05). NULL = 원가 계산표에 입력이 덜 돼 원가 없음
    unit_cost = models.DecimalField('개당 원가', null=True, blank=True, **MONEY)

    class Meta:
        verbose_name = '판매 제품'
        verbose_name_plural = '판매 제품'
        ordering = ['id']

    def __str__(self):
        return f'{self.product_name} × {self.qty}'

    def save(self, *args, **kwargs):
        if not self.product_name and self.product_id:
            self.product_name = self.product.name
        super().save(*args, **kwargs)

    @property
    def amount(self):
        """판매가 = 단가 × 수량"""
        return self.unit_price * self.qty

    @property
    def cost_total(self):
        """원가 = 개당 원가 × 수량. 원가가 없으면 None"""
        return None if self.unit_cost is None else self.unit_cost * self.qty


class SalePack(models.Model):
    """판매 주문의 포장 줄 (SALE-06). 제품 줄과 따로 주문 단위 — 묶음 포장이면 박스 하나에 여러 제품.
    포장재를 지워도 줄은 남고, 저장할 때 복사한 이름 · 단가로 보인다 (지난 판매는 그대로)"""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='packs', verbose_name='판매')
    part = models.ForeignKey(
        Part,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sale_packs',
        verbose_name='포장재',
    )
    # 팔 때의 포장재 이름. 비우면 저장할 때 포장재 이름으로
    part_name = models.CharField('포장재 이름', max_length=100, blank=True)
    qty = qty_field('수량', default=1, validators=[MinValueValidator(Decimal('0.01'))])
    # 팔 때 복사한 개당 단가 (봉투 17.8원처럼 소수). NULL = 포장재에 구매가가 없음
    unit_price = models.DecimalField('개당 단가', max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        verbose_name = '판매 포장'
        verbose_name_plural = '판매 포장'
        ordering = ['id']

    def __str__(self):
        return f'{self.part_name} × {self.qty}'

    def save(self, *args, **kwargs):
        if not self.part_name and self.part_id:
            self.part_name = self.part.name
        super().save(*args, **kwargs)

    @property
    def amount(self):
        """금액 = 단가 × 수량. 단가가 없으면 None"""
        return None if self.unit_price is None else self.unit_price * self.qty
