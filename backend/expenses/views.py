"""지출 장부 JSON API (/api/v0/, docs/api.md "지출").

화면은 지출 목록 전체 + 반복 지출을 받아 요약 · 분류별 합계 · 검색 · 기간 필터 · 넣을 반복 지출 · CSV 를 직접 계산한다.
"""

from django.db import transaction
from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.response import Response

from filaments import services as spool_sync
from filaments.models import Spool
from filaments.views import BaseViewSet
from stock import services as stock

from .models import Expense, ExpenseItem, RecurringExpense
from .serializers import ExpenseSerializer, RecurringExpenseSerializer


def items_for_list():
    """구매 항목 + 표시 이름에 쓰는 색상 · 필라멘트 · 품목 + 스풀 수 · 사용한 스풀 수를 한 번에 (N+1 방지)"""
    return ExpenseItem.objects.select_related('color__filament__brand', 'color__filament__material', 'part').annotate(
        spool_count=Count('spools'),
        used_count=Count('spools', filter=~Q(spools__status=Spool.Status.SEALED)),
    )


class ExpenseViewSet(BaseViewSet):
    queryset = Expense.objects.prefetch_related(Prefetch('items', queryset=items_for_list())).order_by('-date', '-id')
    serializer_class = ExpenseSerializer

    # POST /expenses/ — 한 줄이면 객체, 여러 줄(이번 달 반복 지출 넣기)이면 목록
    @transaction.atomic  # 여러 줄 중 하나라도 틀리면 아무것도 넣지 않음
    def create(self, request, *args, **kwargs):
        many = isinstance(request.data, list)
        serializer = self.get_serializer(data=request.data, many=many)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """지출 삭제. 필라멘트 항목으로 만든 스풀 중 사용한 것이 있으면 409 (안 뜯은 스풀만 지울 수 있음)"""
        expense = self.get_object()
        used = Spool.objects.filter(buy__expense=expense).exclude(status=Spool.Status.SEALED).count()
        if used:
            return Response(
                {'detail': f'사용한 스풀 {used}개가 있어 삭제할 수 없습니다.'}, status=status.HTTP_409_CONFLICT
            )
        return super().destroy(request, *args, **kwargs)

    @transaction.atomic
    def perform_destroy(self, instance):
        # 구매 항목으로 늘린 남은 수량을 되돌리고(입출고 기록에 `지출 삭제` 줄), 만든 `재고` 스풀을 지우고,
        # 지운 뒤 그 품목의 평균 단가를 다시
        parts = {item.part_id for item in instance.items.all() if item.part_id}
        stock.revert_expense(instance)
        for item in instance.items.filter(color__isnull=False):
            spool_sync.drop(item)
        instance.delete()
        stock.recalc_parts(parts)


class RecurringExpenseViewSet(BaseViewSet):
    """반복 지출. 지우면 그 반복에서 넣은 지출은 남고 연결만 끊긴다 (SET_NULL)"""

    queryset = RecurringExpense.objects.annotate(expense_count=Count('expenses')).order_by('day', 'name')
    serializer_class = RecurringExpenseSerializer
