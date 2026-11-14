"""재고 관리 모델 (v2 STOCK) — docs/ERD.md 기준.

재고 품목(Part — 부속품 · 포장재 · 소모품을 kind 로 나눔) ← 품목 카테고리(PartCategory, kind 마다 따로)
  └ 입출고 기록(StockHistory). 남은 수량은 Part.stock 에 바로 두고, 바꿀 때는 services.move() 로 (기록과 함께)
포장 세트(PackSet) → 들어가는 포장재(PackSetLine → Part(포장재))

필라멘트 재고는 filaments 앱. 제품(products)이 부속품 · 포장 세트를, 판매(sales)가 포장재를 가리킨다
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from filaments.models import LOGO_VALIDATORS, MONEY, ShrinkImageMixin


class PartKind(models.TextChoices):
    """재고 관리 탭 (STOCK). 원가에 들어가는 방식이 달라서 나눈다 — 탭은 고정, 탭 안 카테고리는 직접 추가"""

    PART = 'part', '부속품'  # 제품에 붙는 것. 제품 1개당 수량 → 원가, 판매로 빠짐
    PACK = 'pack', '포장재'  # 포장 세트로 제품의 기본 포장 · 판매 주문의 포장 줄에. 판매로 빠짐
    SUPPLY = 'supply', '소모품'  # 셀 수 없게 조금씩 쓰는 것. 원가에 넣지 않음, `다 씀` 으로 빠짐


def kind_field():
    return models.CharField('종류', max_length=10, choices=PartKind.choices, default=PartKind.PART)


def qty_field(verbose_name, **kwargs):
    """수량 (소수 2자리 — 완충재 cm 처럼 나눠 쓰는 것)"""
    return models.DecimalField(verbose_name, max_digits=12, decimal_places=2, **kwargs)


class PartCategory(models.Model):
    """품목 카테고리 (부속품: 부품 · 키링 / 포장재: 박스 · 봉투 / 소모품: 접착 · 마감 …). 탭(kind)마다 따로"""

    kind = kind_field()
    name = models.CharField('이름', max_length=50)

    class Meta:
        verbose_name = '품목 카테고리'
        verbose_name_plural = '품목 카테고리'
        ordering = ['kind', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['kind', 'name'],
                name='unique_part_category_name',
                violation_error_message='이미 있는 카테고리 이름입니다.',
            ),
        ]

    def __str__(self):
        return self.name


class Part(ShrinkImageMixin):
    """재고 품목 (자석 · 박스 · 접착제 …). 묶음 구매가 ÷ 묶음 수량 = 개당 단가

    남은 수량(stock)은 입출고 기록(StockHistory)을 더한 값과 같게 유지한다 — 바꿀 때는 services.move() 로.
    소모품의 구매가는 참고용 (원가에 넣지 않음). 사진은 512px 이내로 줄여 저장 (ShrinkImageMixin)
    """

    image_field = 'photo'
    image_max_px = 512

    kind = kind_field()
    # 탭이 달라도 이름은 겹치지 않게 (지출 구매 줄 · 판매 포장 줄에서 이름으로 고름)
    name = models.CharField('품목', max_length=100, unique=True)
    # 카테고리를 지우면 그 품목은 미분류 (원가는 그대로). 카테고리는 같은 탭(kind)의 것만 (clean)
    category = models.ForeignKey(
        PartCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='parts',
        verbose_name='카테고리',
    )
    photo = models.ImageField('사진', upload_to='parts/', blank=True, validators=LOGO_VALIDATORS)
    shop = models.CharField('회사/구매처', max_length=100, blank=True)
    buy_url = models.URLField('구매 링크', max_length=500, blank=True)
    price = models.DecimalField('묶음 구매가', null=True, blank=True, **MONEY)
    pack_qty = models.DecimalField(
        '묶음 수량',
        max_digits=10,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    unit = models.CharField('단위', max_length=10, default='개')
    # 0 아래로도 내려갈 수 있다 (판매를 먼저 넣고 구매를 나중에 넣을 때 — 경고만)
    stock = qty_field('남은 수량', default=0)
    # 평균 단가 (이동평균, v2 PL). 들어온 것(지출 구매 · 처음 수량)을 남은 수량과 섞어 다시 낸 값
    # — 원가 계산 · 판매 · 손익에 쓴다.
    # 직접 고치지 않고 services.recalc() 가 입출고 기록을 날짜순으로 다시 따라가며 계산한다. NULL = 들어온 값이 없음
    avg_price = models.DecimalField('평균 단가', max_digits=14, decimal_places=4, null=True, blank=True, editable=False)
    # 부족 알림 기준은 탭마다 하나 — products.CostSetting.alert_<kind> (v2.1.0)
    note = models.TextField('메모', blank=True)

    class Meta:
        verbose_name = '재고 품목'
        verbose_name_plural = '재고 품목'
        ordering = ['name']

    def __str__(self):
        return self.name

    def clean(self):
        if self.category_id and self.category.kind != self.kind:
            raise ValidationError({'category': '같은 탭의 카테고리를 고르세요.'})

    @property
    def base_price(self):
        """직접 넣은 구매가 ÷ 묶음 수량 — 지출로 산 적이 없는 품목의 단가 (처음 수량). 구매가가 없으면 None"""
        return None if self.price is None else Decimal(self.price) / Decimal(self.pack_qty)

    @property
    def unit_price(self):
        """개당 단가 = 평균 단가 (원가 계산 · 판매 포장 줄 · 손익). 평균이 없으면 직접 넣은 구매가, 둘 다 없으면 None"""
        return self.avg_price if self.avg_price is not None else self.base_price


class StockHistory(models.Model):
    """입출고 기록 한 줄 (STOCK-05). qty 는 늘면 +, 줄면 −. after = 이 기록 뒤의 남은 수량"""

    class Kind(models.TextChoices):
        BUY = 'buy', '지출'  # 지출 장부의 구매 줄 (TBD-31)
        SALE = 'sale', '판매'  # 판매 저장 (부속품 = 제품 × 수량, 포장재 = 주문의 포장 줄)
        USE = 'use', '다 씀'  # 소모품 `1개 다 씀`
        ADJUST = 'adjust', '조정'  # 직접 맞추기 · 빼기 · 더하기, 처음 등록할 때 지금 수량

    part = models.ForeignKey(Part, on_delete=models.CASCADE, related_name='history', verbose_name='품목')
    date = models.DateField('날짜', default=timezone.localdate)
    kind = models.CharField('종류', max_length=10, choices=Kind.choices)
    qty = qty_field('수량')
    after = qty_field('그 뒤 남은 수량')
    # 조정 사유 · 판매 주문 요약처럼 목록에 보일 설명
    note = models.CharField('설명', max_length=200, blank=True)
    # 판매로 빠진 기록이면 그 판매 (고칠 때 차이 계산). 판매를 지우면 되돌리는 기록을 남기고 연결은 끊김
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_history',
        verbose_name='판매',
    )
    # 지출 구매 줄로 들어온 기록이면 그 지출 (판매와 같은 방식 — 고칠 때 차이 계산, 지우면 되돌리는 기록)
    expense = models.ForeignKey(
        'expenses.Expense',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_history',
        verbose_name='지출',
    )
    # 이 기록 때의 개당 단가 = 그때의 평균 단가 (v2 PL — 손익 기준의 부속품 · 포장재 `쓴 만큼`).
    # services.recalc() 가 맞춘다. 처음 수량은 등록할 때의 구매가. NULL = 단가를 알 수 없음 (0원으로 계산)
    unit_price = models.DecimalField('개당 단가', max_digits=14, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField('추가일', auto_now_add=True)

    class Meta:
        verbose_name = '입출고 기록'
        verbose_name_plural = '입출고 기록'
        ordering = ['-date', '-id']
        db_table = 'stock_history'  # 기본값 stock_stockhistory 는 앱 이름이 겹쳐서

    def __str__(self):
        return f'{self.date} {self.part} {self.qty:+}'


class PackSet(models.Model):
    """포장 세트 (봉투 포장 · 작은 박스 …, STOCK-06). 제품의 기본 포장 · 판매 주문의 포장 줄을 채우는 데 쓴다"""

    name = models.CharField('세트 이름', max_length=100, unique=True)
    note = models.TextField('비고', blank=True)

    class Meta:
        verbose_name = '포장 세트'
        verbose_name_plural = '포장 세트'
        ordering = ['name']

    def __str__(self):
        return self.name


class PackSetLine(models.Model):
    """포장 세트에 들어가는 포장재 한 줄 + 수량"""

    pack_set = models.ForeignKey(PackSet, on_delete=models.CASCADE, related_name='lines', verbose_name='포장 세트')
    # 세트에서 쓰면 포장재 삭제 불가
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name='pack_lines', verbose_name='포장재')
    qty = qty_field('수량', default=1, validators=[MinValueValidator(Decimal('0.01'))])

    class Meta:
        verbose_name = '포장 세트 구성'
        verbose_name_plural = '포장 세트 구성'
        ordering = ['id']

    def __str__(self):
        return f'{self.part} × {self.qty}'
