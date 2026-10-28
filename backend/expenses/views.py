"""지출 장부 JSON API (/api/v0/, docs/api.md "지출").

화면은 지출 목록 전체 + 반복 지출을 받아 요약 · 분류별 합계 · 검색 · 기간 필터 · 넣을 반복 지출 · CSV 를 직접 계산한다.
"""

from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.response import Response

from filaments.views import BaseViewSet

from .models import Expense, RecurringExpense
from .serializers import ExpenseSerializer, RecurringExpenseSerializer


class ExpenseViewSet(BaseViewSet):
    queryset = Expense.objects.order_by('-date', '-id')
    serializer_class = ExpenseSerializer

    # POST /expenses/ — 한 줄이면 객체, 여러 줄(이번 달 반복 지출 넣기)이면 목록
    @transaction.atomic  # 여러 줄 중 하나라도 틀리면 아무것도 넣지 않음
    def create(self, request, *args, **kwargs):
        many = isinstance(request.data, list)
        serializer = self.get_serializer(data=request.data, many=many)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RecurringExpenseViewSet(BaseViewSet):
    """반복 지출. 지우면 그 반복에서 넣은 지출은 남고 연결만 끊긴다 (SET_NULL)"""

    queryset = RecurringExpense.objects.annotate(expense_count=Count('expenses')).order_by('day', 'name')
    serializer_class = RecurringExpenseSerializer
