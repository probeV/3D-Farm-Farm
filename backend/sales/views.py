"""판매 장부 JSON API (/api/v0/, docs/api.md "판매").

화면은 판매 목록 전체를 받아 요약 · 제품별 판매 · 검색 · 기간 필터 · CSV 를 직접 계산한다.
"""

from django.db import transaction

from filaments.views import BaseViewSet
from stock import services as stock

from .models import Sale
from .serializers import SaleSerializer


class SaleViewSet(BaseViewSet):
    # 줄을 미리 읽어 둔다 — 판매가 합계 · 정산 금액 · 원가 · 이익을 판매마다 다시 조회하지 않게 (N+1 방지)
    queryset = Sale.objects.prefetch_related('items', 'parts', 'packs').order_by('-date', '-id')
    serializer_class = SaleSerializer

    @transaction.atomic
    def perform_destroy(self, instance):
        # 이 판매로 뺀 부속품 · 포장재를 되돌린 뒤 지운다 (입출고 기록에 `판매 삭제` 줄)
        stock.revert_sale(instance)
        instance.delete()
