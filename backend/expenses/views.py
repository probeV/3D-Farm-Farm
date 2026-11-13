"""지출 장부 JSON API (/api/v0/, docs/api.md "지출").

화면은 지출 목록 전체 + 반복 지출을 받아 요약 · 분류별 합계 · 검색 · 기간 필터 · 넣을 반복 지출 · CSV 를 직접 계산한다.
"""

from django.db import transaction
from django.db.models import Count, Prefetch
from rest_framework import status
from rest_framework.response import Response

from filaments.views import BaseViewSet
from stock import services as stock

from .models import Expense, ExpenseItem, RecurringExpense, item_key, refresh_buy_prices
from .serializers import ExpenseSerializer, RecurringExpenseSerializer


def items_for_list():
    """구매 줄 + 표시 이름에 쓰는 색상 · 필라멘트 · 품목 + 등록한 스풀 수를 한 번에 (N+1 방지)"""
    return ExpenseItem.objects.select_related('color__filament__brand', 'color__filament__material', 'part').annotate(
        spool_count=Count('spools')
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
    def perform_destroy(self, instance):
        # 구매 줄로 늘린 남은 수량을 되돌리고(입출고 기록에 `지출 삭제` 줄), 지운 뒤 단가를 남은 최근 구매로
        keys = {item_key(line) for line in instance.items.all()}
        stock.revert_expense(instance)
        instance.delete()
        refresh_buy_prices(keys)


class RecurringExpenseViewSet(BaseViewSet):
    """반복 지출. 지우면 그 반복에서 넣은 지출은 남고 연결만 끊긴다 (SET_NULL)"""

    queryset = RecurringExpense.objects.annotate(expense_count=Count('expenses')).order_by('day', 'name')
    serializer_class = RecurringExpenseSerializer
