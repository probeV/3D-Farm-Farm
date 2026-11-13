"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "지출"). 요약 · 분류별 합계 · 넣을 반복 지출은 화면이 목록으로 계산한다."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from filaments.serializers import BaseModelSerializer, NumberField
from stock import services as stock

from .models import (
    BUY_CATEGORIES,
    BUY_PART_KINDS,
    Expense,
    ExpenseCategory,
    ExpenseLine,
    RecurringExpense,
    line_key,
    refresh_buy_prices,
    split_totals,
)

CATEGORY_ERRORS = {'invalid_choice': '없는 분류입니다.'}


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


class ExpenseLineSerializer(BaseModelSerializer):
    """구매 줄 (TBD-31). 필라멘트 지출은 color · 통 수, 부속품 · 포장재 · 소모품 지출은 그 탭의 part · 수량.
    수정할 때 기존 줄은 id 를 함께 보낸다 (그 줄로 등록한 스풀 연결이 유지됨)"""

    id = serializers.IntegerField(required=False)
    qty = NumberField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    amount = NumberField(max_digits=10, decimal_places=0, min_value=0, required=False, allow_null=True)
    total = NumberField(max_digits=12, decimal_places=2, read_only=True)
    each = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    spools = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseLine
        fields = ['id', 'color', 'part', 'qty', 'amount', 'total', 'each', 'name', 'unit', 'spools']
        extra_kwargs = {
            'color': {'required': False, 'error_messages': {'does_not_exist': '없는 색상입니다.'}},
            'part': {'required': False, 'error_messages': {'does_not_exist': '없는 품목입니다.'}},
        }

    def get_each(self, obj):
        """1개(통)당 금액 (소수 2자리)"""
        return round(float(obj.each), 2)

    def get_name(self, obj):
        """목록 표시용: `Bambu Lab › PLA Basic · 화이트` / `네오디뮴 자석 6×3mm`"""
        return f'{obj.color.filament.display_name} · {obj.color.name}' if obj.color_id else obj.part.name

    def get_unit(self, obj):
        return '통' if obj.color_id else obj.part.unit

    def get_spools(self, obj):
        """이 줄로 등록한 스풀 수 (필라멘트만). 목록은 뷰가 annotate 로 붙여 둔다"""
        if not obj.color_id:
            return 0
        count = getattr(obj, 'spool_count', None)
        return obj.spools.count() if count is None else count


class ExpenseSerializer(BaseModelSerializer):
    """지출 한 줄 + 구매 줄 (TBD-31).

    1. 구매 줄(lines): 분류가 필라멘트 · 부속품 · 포장재 · 소모품일 때만 (비워도 저장). 보내면 그 목록으로 맞춘다 —
       id 가 있는 줄은 고치고, 없는 줄은 새로, 안 보낸 기존 줄은 지운다. 안 보내면 그대로 (분류를 바꾸면 지움)
    2. 줄 금액(total): 금액을 비운 줄은 총액에서 나눠 넣는다 (models.split_totals). 총액 · 줄이 바뀔 때마다 다시
    3. 저장하면 — 품목 줄은 남은 수량 + 수량 (고치면 차이만, stock.sync_expense), 바뀐 색상 · 품목은 최근 구매가로
       단가를 다시 맞춘다 (models.refresh_buy_prices). 지울 때는 뷰가 되돌린다
    4. 필라멘트 줄로 등록한 스풀이 있으면 그 줄의 색상은 못 바꾸고 통 수는 등록한 수 아래로 못 줄인다.
       줄을 지우면 스풀은 연결만 끊긴다 (구매가 그대로)
    """

    lines = ExpenseLineSerializer(many=True, required=False)

    class Meta:
        model = Expense
        fields = ['id', 'date', 'name', 'category', 'amount', 'shop', 'note', 'recurring', 'lines']
        list_serializer_class = ExpenseListSerializer
        extra_kwargs = {
            'category': {'error_messages': CATEGORY_ERRORS},
            'recurring': {'error_messages': {'does_not_exist': '없는 반복 지출입니다.'}},
        }

    # ---- 입력 검사
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
        if 'lines' in attrs:
            category = attrs.get('category', getattr(self.instance, 'category', None))
            amount = attrs.get('amount', getattr(self.instance, 'amount', None))
            self._check_lines(category, amount, attrs['lines'])
        return attrs

    def _check_lines(self, category, amount, lines):
        def fail(i, field, message):
            errors = [{} for _ in lines]
            errors[i] = {field: [message]}
            raise serializers.ValidationError({'lines': errors})

        if lines and category not in BUY_CATEGORIES:
            raise serializers.ValidationError(
                {'lines': ['구매 줄은 필라멘트 · 부속품 · 포장재 · 소모품 지출에만 적어요.']}
            )
        old = {line.pk: line for line in self.instance.lines.all()} if self.instance else {}
        seen = set()
        for i, row in enumerate(lines):
            color, part = row.get('color'), row.get('part')
            if category == ExpenseCategory.FILAMENT:
                if not color or part:
                    fail(i, 'color', '색상을 고르세요.')
                if row['qty'] != row['qty'].to_integral_value():
                    fail(i, 'qty', '통 수는 정수로 적으세요.')
            else:
                if not part or color:
                    fail(i, 'part', '품목을 고르세요.')
                if part.kind != BUY_PART_KINDS[category]:
                    fail(i, 'part', f'{ExpenseCategory(category).label} 탭의 품목만 고를 수 있습니다.')
            key = ('color', color.pk) if color else ('part', part.pk)
            if key in seen:
                fail(i, 'color' if color else 'part', '같은 것이 두 줄 있습니다.')
            seen.add(key)
            if 'id' in row:
                line = old.get(row['id'])
                if line is None:
                    fail(i, 'id', '이 지출의 구매 줄이 아닙니다.')
                spools = line.spools.count()
                if spools and line.color_id != getattr(color, 'pk', None):
                    fail(i, 'color', f'스풀 {spools}통을 이미 등록해서 색상을 바꿀 수 없습니다.')
                if spools > row['qty']:
                    fail(i, 'qty', f'스풀 {spools}통을 이미 등록했습니다.')
        blank = [row for row in lines if row.get('amount') is None]
        if category != ExpenseCategory.FILAMENT and len(blank) > 1:
            raise serializers.ValidationError({'lines': ['여러 가지면 줄마다 금액을 적으세요.']})
        fixed = sum((row['amount'] for row in lines if row.get('amount') is not None), Decimal(0))
        if amount is not None and fixed > amount:
            raise serializers.ValidationError({'lines': ['줄 금액 합계가 지출 금액보다 큽니다.']})

    # ---- 저장
    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        expense = super().create(validated_data)
        self._save_lines(expense, lines, before={})
        return expense

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        before = snapshot(instance)
        if lines is None and validated_data.get('category', instance.category) != instance.category:
            lines = []  # 분류를 바꾸면 이전 분류의 구매 줄은 맞지 않으므로 지움
        expense = super().update(instance, validated_data)
        self._save_lines(expense, lines, before)
        return expense

    @staticmethod
    def _save_lines(expense, rows, before):
        """구매 줄 맞추기(rows 가 None 이면 그대로) → 줄 금액 다시 → 남은 수량 · 최근 구매가"""
        if rows is not None:
            keep = {row['id'] for row in rows if 'id' in row}
            expense.lines.exclude(pk__in=keep).delete()
            for row in rows:
                row = {'color': None, 'part': None, 'amount': None, **row}
                pk = row.pop('id', None)
                if pk:
                    ExpenseLine.objects.filter(pk=pk).update(**row)
                else:
                    ExpenseLine.objects.create(expense=expense, **row)
        # 응답에서 새 줄이 보이도록 미리 읽어 둔 줄을 비운다
        if hasattr(expense, '_prefetched_objects_cache'):
            expense._prefetched_objects_cache.pop('lines', None)
        lines = list(expense.lines.all())
        split_totals(expense.category, expense.amount, lines)
        ExpenseLine.objects.bulk_update(lines, ['total'])
        stock.sync_expense(expense)
        after = snapshot(expense)
        refresh_buy_prices({key for key in before.keys() | after.keys() if before.get(key) != after.get(key)})


def snapshot(expense):
    """최근 구매가에 쓰는 값 {('color'|'part', id): (날짜, 수량, 줄 금액)}. 저장 전후를 비교해 바뀐 것만 다시 맞춘다"""
    return {line_key(line): (expense.date, line.qty, line.total) for line in expense.lines.all()}
