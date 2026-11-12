"""판매 장부 JSON API (/api/v0/, docs/api.md "판매").

화면은 판매 목록 전체를 받아 요약 · 제품별 판매 · 검색 · 기간 필터 · CSV 를 직접 계산한다.
"""

from filaments.views import BaseViewSet

from .models import Sale
from .serializers import SaleSerializer


class SaleViewSet(BaseViewSet):
    # 줄을 미리 읽어 둔다 — 판매가 합계 · 정산 금액 · 원가 · 이익을 판매마다 다시 조회하지 않게 (N+1 방지)
    queryset = Sale.objects.prefetch_related('items').order_by('-date', '-id')
    serializer_class = SaleSerializer
