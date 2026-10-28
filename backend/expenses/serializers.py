"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "지출"). 요약 · 분류별 합계 · 넣을 반복 지출은 화면이 목록으로 계산한다."""

from django.utils import timezone
from rest_framework import serializers

from filaments.serializers import BaseModelSerializer

from .models import Expense, RecurringExpense

CATEGORY_ERRORS = {'invalid_choice': '없는 분류입니다.'}
URL_ERRORS = {'invalid': 'https:// 로 시작하는 주소로 입력하세요.'}


class RecurringExpenseSerializer(BaseModelSerializer):
    # 이 반복 지출에서 넣은 지출 수 (관리 창 표시용)
    expense_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = RecurringExpense
        fields = ['id', 'name', 'category', 'amount', 'day', 'start', 'note', 'expense_count']
        extra_kwargs = {'category': {'error_messages': CATEGORY_ERRORS}}


class ExpenseListSerializer(serializers.ListSerializer):
    """여러 줄 한 번에 추가 (이번 달 반복 지출 넣기). 같은 반복 지출을 같은 달에 두 줄 넣지 않는다"""

    def validate(self, attrs):
        seen = set()
        for row in attrs:
            if row.get('recurring') is None:
                continue
            key = (row['recurring'].pk, row['date'].year, row['date'].month)
            if key in seen:
                raise serializers.ValidationError('같은 반복 지출을 한 달에 두 번 넣을 수 없습니다.')
            seen.add(key)
        return attrs


class ExpenseSerializer(BaseModelSerializer):
    class Meta:
        model = Expense
        fields = ['id', 'date', 'name', 'category', 'amount', 'shop', 'url', 'note', 'recurring']
        list_serializer_class = ExpenseListSerializer
        extra_kwargs = {
            'category': {'error_messages': CATEGORY_ERRORS},
            'url': {'error_messages': URL_ERRORS},
            'recurring': {'error_messages': {'does_not_exist': '없는 반복 지출입니다.'}},
        }

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('오늘 이후 날짜는 넣을 수 없습니다.')
        return value

    def validate(self, attrs):
        recurring = attrs.get('recurring', getattr(self.instance, 'recurring', None))
        date = attrs.get('date', getattr(self.instance, 'date', None))
        if recurring and date:
            same = Expense.objects.filter(recurring=recurring, date__year=date.year, date__month=date.month)
            if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
                same = same.exclude(pk=self.instance.pk)
            if same.exists():
                raise serializers.ValidationError({'recurring': ['이 달에 이미 넣은 반복 지출입니다.']})
        return attrs
