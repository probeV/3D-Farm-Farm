"""재고 관리 JSON API (/api/v0/, docs/api.md "재고 관리").

화면은 품목 목록 전체를 받아 탭(kind)별 카드 · 표 · 부족 알림 · 남은 금액 · 세트 원가 ·
바로 쌀 수 있는 수를 직접 계산한다.
남은 수량은 조정 · 다 씀 API(여기)와 판매 저장(sales)에서만 바뀐다 — 모두 services.move() 로.
"""

from django.db import transaction
from django.db.models import Count, Max, Prefetch, Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from expenses.models import last_buy_annotations
from filaments.views import BaseViewSet

from . import services
from .models import PackSet, PackSetLine, Part, PartCategory, PartKind, StockHistory
from .serializers import (
    AdjustSerializer,
    PackSetSerializer,
    PartCategorySerializer,
    PartSerializer,
    StockHistorySerializer,
    UseSerializer,
)

# 주의: annotate(Count) 를 쓰면 모델 Meta.ordering 이 무시되므로 order_by 를 직접 붙인다


class KindFilterMixin:
    """`?kind=pack` 이면 그 탭 것만. 없으면 전부"""

    def get_queryset(self):
        queryset = super().get_queryset()
        kind = self.request.query_params.get('kind')
        if self.action == 'list' and kind:
            if kind not in PartKind.values:
                raise serializers.ValidationError({'kind': ['없는 종류입니다.']})
            queryset = queryset.filter(kind=kind)
        return queryset


class PartCategoryViewSet(KindFilterMixin, BaseViewSet):
    """품목 카테고리 (탭마다 따로). 지우면 그 품목은 미분류 (SET_NULL, 막는 것 없음)"""

    queryset = PartCategory.objects.annotate(part_count=Count('parts')).order_by('kind', 'name')
    serializer_class = PartCategorySerializer


def parts_with_counts():
    # 같은 제품 · 세트에 같은 품목을 두 줄 둘 수도 있으므로 distinct
    return Part.objects.annotate(
        product_count=Count('product_parts__product', distinct=True),
        set_count=Count('pack_lines__pack_set', distinct=True),
        last_used=Max('history__date', filter=Q(history__kind=StockHistory.Kind.USE)),
        **last_buy_annotations('part'),
    ).order_by('name')


class PartViewSet(KindFilterMixin, BaseViewSet):
    """재고 품목 (부속품 · 포장재 · 소모품)"""

    queryset = parts_with_counts()
    serializer_class = PartSerializer
    protected_messages = {
        'products.ProductPart': '제품에서 쓰고 있어서 삭제할 수 없습니다.',
        'stock.PackSetLine': '포장 세트에서 쓰고 있어서 삭제할 수 없습니다.',
    }

    def _respond(self, part, code=status.HTTP_200_OK):
        part = parts_with_counts().get(pk=part.pk)  # 응답용 다시 조회 (제품 수 · 세트 수 · 마지막으로 다 쓴 날)
        return Response(PartSerializer(part).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._respond(serializer.save(), status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return self._respond(serializer.save())

    # POST /parts/{id}/adjust/ {mode, qty, note}
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def adjust(self, request, pk=None):
        """조정 (STOCK-04) → 바뀐 품목. 바뀐 게 없으면 기록도 남기지 않는다"""
        part = self.get_object()
        data = AdjustSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        note = data.validated_data['note'].strip()
        services.adjust(part, data.validated_data['mode'], data.validated_data['qty'], note)
        return self._respond(part)

    # POST /parts/{id}/use/ {note?}
    @action(detail=True, methods=['post'])
    @transaction.atomic
    def use(self, request, pk=None):
        """소모품 `1개 다 씀` (STOCK-07) → 바뀐 품목. 소모품이 아니면 400"""
        part = self.get_object()
        if part.kind != PartKind.SUPPLY:
            raise serializers.ValidationError({'detail': '소모품만 다 씀으로 뺄 수 있습니다.'})
        data = UseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reason = data.validated_data['note'].strip()
        services.move(part, StockHistory.Kind.USE, -1, f'다 씀 ({reason})' if reason else '다 씀')
        return self._respond(part)

    # GET /parts/{id}/history/
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """입출고 기록 (STOCK-05), 최근순"""
        part = self.get_object()
        return Response(StockHistorySerializer(part.history.all(), many=True).data)


class PackSetViewSet(BaseViewSet):
    """포장 세트 (STOCK-06). 기본 포장으로 쓰는 제품이 있으면 삭제 불가"""

    queryset = (
        PackSet.objects.annotate(product_count=Count('products', distinct=True))
        .prefetch_related(Prefetch('lines', queryset=PackSetLine.objects.order_by('id')))
        .order_by('name')
    )
    serializer_class = PackSetSerializer
    protected_message = '기본 포장으로 쓰는 제품이 있어서 삭제할 수 없습니다.'

    def _respond(self, pack_set, code=status.HTTP_200_OK):
        pack_set = self.get_queryset().get(pk=pack_set.pk)  # 응답용 다시 조회 (제품 수 · 새 줄)
        return Response(PackSetSerializer(pack_set).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return self._respond(serializer.save(), status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return self._respond(serializer.save())
