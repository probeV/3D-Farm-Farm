"""스마트스토어 연동 모델 — docs/plans/v2.md STORE.

- 상품 연결(StoreLink, STORE-02): 스토어 상품(+ 옵션 글자) → 이 앱의 제품. 한 번 짝지어 두면 다음 가져오기부터 자동
- 가져오기 기록(StoreImport, STORE-05): 언제 · 어느 기간 · 몇 건 넣음 / 맞춤 / 뺌
가져온 주문은 판매 장부(sales.Sale)에 그대로 들어간다 — 주문번호는 Sale.order_no, 상품주문번호는 SaleItem.store_item_id.
애플리케이션 ID · 시크릿은 DB 에 저장하지 않는다 (STORE-04, backend/.env 가 가리키는 파일에서 읽음)
"""

from django.db import models

from products.models import Product


class StoreLink(models.Model):
    """스토어 상품 → 이 앱의 제품 (STORE-02)

    - 옵션 글자(option)가 빈 줄 = 그 스토어 상품의 기본 연결
    - 옵션 글자가 있는 줄 = 주문의 옵션에 그 글자가 들어 있으면 이 제품 (예: `스위치: 적축` → 적축 클리커).
      `글자: A` 처럼 제품이 달라지지 않는 옵션은 적지 않는다
    - product 가 비면 `연결 안 함` — 그 상품이 든 주문은 미리보기에서 `상품 연결 필요`
    가져올 때 처음 보는 스토어 상품은 기본 연결 줄(제품 없음)로 저절로 생긴다
    """

    store_product_id = models.CharField('스토어 상품번호', max_length=30)
    store_name = models.CharField('스토어 상품명', max_length=200)
    option = models.CharField('옵션 글자', max_length=100, blank=True)
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='store_links',
        verbose_name='제품',
    )
    updated_at = models.DateTimeField('바꾼 날', auto_now=True)

    class Meta:
        verbose_name = '스토어 상품 연결'
        verbose_name_plural = '스토어 상품 연결'
        ordering = ['store_name', 'store_product_id', 'option']
        constraints = [
            models.UniqueConstraint(fields=['store_product_id', 'option'], name='unique_store_link'),
        ]

    def __str__(self):
        return f'{self.store_name}' + (f' · {self.option}' if self.option else '')

    @classmethod
    def resolve(cls, store_product_id, option_text, links=None):
        """주문 한 줄의 스토어 상품번호 · 옵션 → 연결 줄 (없으면 None).
        옵션 글자가 주문 옵션에 들어 있는 줄을 먼저 (여러 개면 글자가 긴 것), 없으면 기본 연결 줄.
        links: 미리 읽어 둔 연결 목록 (여러 주문을 볼 때 쿼리를 한 번만)"""
        rows = [
            x
            for x in (links if links is not None else cls.objects.filter(store_product_id=store_product_id))
            if x.store_product_id == store_product_id
        ]
        text = option_text or ''
        hits = [x for x in rows if x.option and x.option in text]
        if hits:
            return max(hits, key=lambda x: len(x.option))
        return next((x for x in rows if not x.option), None)


class StoreImport(models.Model):
    """가져오기 기록 한 줄 (STORE-05). 판매 장부에 넣을 때 남긴다"""

    created_at = models.DateTimeField('가져온 때', auto_now_add=True)
    date_from = models.DateField('기간 시작')
    date_to = models.DateField('기간 끝')
    added = models.PositiveIntegerField('넣은 주문', default=0)
    # 이미 넣은 주문이 취소 · 반품 · 정산 금액이 바뀌어 판매를 고치거나 지운 건수
    updated = models.PositiveIntegerField('맞춘 주문', default=0)
    skipped = models.PositiveIntegerField('뺀 주문', default=0)
    note = models.CharField('설명', max_length=200, blank=True)

    class Meta:
        verbose_name = '가져오기 기록'
        verbose_name_plural = '가져오기 기록'
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.date_from}~{self.date_to}'
