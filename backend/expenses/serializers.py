"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "지출"). 요약 · 분류별 합계 · 넣을 반복 지출은 화면이 목록으로 계산한다."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from filaments import services as spool_sync
from filaments.serializers import BaseModelSerializer, NumberField
from stock import services as stock

from .models import (
    BUY_CATEGORIES,
    BUY_PART_KINDS,
    Expense,
    ExpenseCategory,
    ExpenseItem,
    RecurringExpense,
    item_key,
    refresh_buy_prices,
    split_totals,
    won,
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


class ExpenseItemSerializer(BaseModelSerializer):
    """구매 항목 (TBD-31 · 33). 필라멘트 지출은 color · 롤 수, 부속품 · 포장재 · 소모품 지출은 그 탭의 part · 수량.
    수정할 때 기존 항목은 id 를 함께 보낸다 (그 항목으로 만든 스풀이 이어짐 — 롤 수 차이만 더하고 뺌)"""

    id = serializers.IntegerField(required=False)
    qty = NumberField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    amount = NumberField(max_digits=10, decimal_places=0, min_value=0, required=False, allow_null=True)
    total = NumberField(max_digits=12, decimal_places=2, read_only=True)
    each = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()
    spools = serializers.SerializerMethodField()
    used = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseItem
        fields = ['id', 'color', 'part', 'qty', 'amount', 'total', 'each', 'name', 'unit', 'spools', 'used']
        extra_kwargs = {
            'color': {'required': False, 'error_messages': {'does_not_exist': '없는 색상입니다.'}},
            'part': {'required': False, 'error_messages': {'does_not_exist': '없는 품목입니다.'}},
        }

    def get_each(self, obj):
        """1개(롤)당 금액 (소수 2자리)"""
        return round(float(obj.each), 2)

    def get_name(self, obj):
        """목록 표시용: `Bambu Lab › PLA Basic · 화이트` / `네오디뮴 자석 6×3mm`"""
        return f'{obj.color.filament.display_name} · {obj.color.name}' if obj.color_id else obj.part.name

    def get_unit(self, obj):
        return '롤' if obj.color_id else obj.part.unit

    def _counts(self, obj):
        """(이 항목의 스풀 수, 사용한 스풀 수). 목록은 뷰가 annotate 로 붙여 둔다"""
        if not obj.color_id:
            return 0, 0
        if getattr(obj, 'spool_count', None) is None:
            sealed, used = spool_sync.counts([obj.pk]).get(obj.pk, (0, 0))
            return sealed + used, used
        return obj.spool_count, obj.used_count

    def get_spools(self, obj):
        """이 항목으로 만든 스풀 수 (필라멘트) — 스풀에서 지운 것은 빠짐"""
        return self._counts(obj)[0]

    def get_used(self, obj):
        """그중 사용한(사용 중 · 사용 완료) 스풀 수 — 이만큼은 지출에서 줄이거나 색상을 바꾸거나 지울 수 없음"""
        return self._counts(obj)[1]


class ExpenseSerializer(BaseModelSerializer):
    """지출 한 줄 + 구매 항목 (TBD-31 · 33).

    1. 구매 항목(items): 분류가 필라멘트 · 부속품 · 포장재 · 소모품일 때만 (비워도 저장). 보내면 그 목록으로 맞춘다 —
       id 가 있는 항목은 고치고, 없는 항목은 새로, 안 보낸 기존 항목은 지운다. 안 보내면 그대로 (분류를 바꾸면 지움).
       같은 색상 · 품목을 여러 항목으로 적어도 된다 (예: 화이트 9롤 + 할인 1롤)
    2. 항목 금액(total): 금액을 비운 항목은 총액에서 나눠 넣는다 (models.split_totals). 총액 · 항목이 바뀔 때마다 다시
    3. 저장하면 —
       - 품목: 남은 수량 + 수량 (고치면 차이만, stock.sync_expense)
       - 필라멘트: 롤 수만큼 스풀을 만든다 (고치면 차이만, 색상 · 구매가 · 구매일도 맞춤 — filaments.services)
       - 바뀐 색상 · 품목은 최근 구매가로 단가를 다시 맞춘다 (models.refresh_buy_prices)
       지울 때는 뷰가 되돌린다
    4. 사용한(사용 중 · 사용 완료) 스풀이 있는 필라멘트 항목은 색상 변경 · 빼기를 막고,
       롤 수는 `재고` 스풀이 있는 만큼만 줄일 수 있다
    """

    items = ExpenseItemSerializer(many=True, required=False)

    class Meta:
        model = Expense
        fields = ['id', 'date', 'name', 'category', 'amount', 'shop', 'note', 'recurring', 'items']
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
        category = attrs.get('category', getattr(self.instance, 'category', None))
        if self.instance and 'items' not in attrs and category != self.instance.category:
            attrs['items'] = []  # 분류를 바꾸면 이전 분류의 구매 항목은 맞지 않으므로 지움
        if 'items' in attrs:
            amount = attrs.get('amount', getattr(self.instance, 'amount', None))
            self._check_items(category, amount, attrs['items'])
        return attrs

    def _check_items(self, category, amount, rows):
        def fail(i, field, message):
            errors = [{} for _ in rows]
            errors[i] = {field: [message]}
            raise serializers.ValidationError({'items': errors})

        if rows and category not in BUY_CATEGORIES:
            raise serializers.ValidationError(
                {'items': ['구매 항목은 필라멘트 · 부속품 · 포장재 · 소모품 지출에만 적어요.']}
            )
        old = {item.pk: item for item in self.instance.items.all()} if self.instance else {}
        counted = spool_sync.counts([pk for pk, item in old.items() if item.color_id])
        for i, row in enumerate(rows):
            color, part = row.get('color'), row.get('part')
            if category == ExpenseCategory.FILAMENT:
                if not color or part:
                    fail(i, 'color', '색상을 고르세요.')
                if row['qty'] != row['qty'].to_integral_value():
                    fail(i, 'qty', '롤 수는 정수로 적으세요.')
            else:
                if not part or color:
                    fail(i, 'part', '품목을 고르세요.')
                if part.kind != BUY_PART_KINDS[category]:
                    fail(i, 'part', f'{ExpenseCategory(category).label} 탭의 품목만 고를 수 있습니다.')
            if 'id' not in row:
                continue
            item = old.get(row['id'])
            if item is None:
                fail(i, 'id', '이 지출의 구매 항목이 아닙니다.')
            if not item.color_id:
                continue
            # 필라멘트 항목: 사용한 스풀이 있으면 색상 변경 불가, 롤 수는 `재고` 스풀이 있는 만큼만 줄이기
            sealed, used = counted.get(item.pk, (0, 0))
            if used and getattr(color, 'pk', None) != item.color_id:
                fail(i, 'color', f'사용한 스풀 {used}개가 있어 색상을 바꿀 수 없습니다.')
            if color and item.qty - row['qty'] > sealed:
                fail(i, 'qty', f'재고 스풀이 {sealed}개라 {int(item.qty) - sealed}롤보다 적게 줄일 수 없습니다.')
        keep = {row['id'] for row in rows if 'id' in row}
        dropped = [item for pk, item in old.items() if pk not in keep and counted.get(pk, (0, 0))[1]]
        if dropped:
            used = sum(counted[item.pk][1] for item in dropped)
            raise serializers.ValidationError({'items': [f'사용한 스풀 {used}개가 있는 항목은 뺄 수 없습니다.']})
        blank = [row for row in rows if row.get('amount') is None]
        if category != ExpenseCategory.FILAMENT and len(blank) > 1:
            raise serializers.ValidationError({'items': ['여러 가지면 항목마다 금액을 적으세요.']})
        fixed = sum((row['amount'] for row in rows if row.get('amount') is not None), Decimal(0))
        if amount is not None and fixed > amount:
            raise serializers.ValidationError({'items': ['항목 금액 합계가 지출 금액보다 큽니다.']})

    # ---- 저장
    @transaction.atomic
    def create(self, validated_data):
        rows = validated_data.pop('items', [])
        expense = super().create(validated_data)
        self._save_items(expense, rows, before={}, old_qty={})
        return expense

    @transaction.atomic
    def update(self, instance, validated_data):
        rows = validated_data.pop('items', None)
        before = snapshot(instance)
        old_qty = {item.pk: item.qty for item in instance.items.all() if item.color_id}
        expense = super().update(instance, validated_data)
        self._save_items(expense, rows, before, old_qty)
        return expense

    @staticmethod
    def _save_items(expense, rows, before, old_qty):
        """구매 항목 맞추기(rows 가 None 이면 그대로) → 항목 금액 다시 → 남은 수량 · 스풀 · 최근 구매가"""
        if rows is not None:
            keep = {row['id'] for row in rows if 'id' in row}
            for item in expense.items.exclude(pk__in=keep):
                spool_sync.drop(item)  # 뺀 필라멘트 항목의 `재고` 스풀 (사용한 스풀이 있으면 검사에서 막음)
            expense.items.exclude(pk__in=keep).delete()
            for row in rows:
                row = {'color': None, 'part': None, 'amount': None, **row}
                pk = row.pop('id', None)
                if pk:
                    ExpenseItem.objects.filter(pk=pk).update(**row)
                else:
                    ExpenseItem.objects.create(expense=expense, **row)
        # 응답에서 새 항목이 보이도록 미리 읽어 둔 항목을 비운다
        if hasattr(expense, '_prefetched_objects_cache'):
            expense._prefetched_objects_cache.pop('items', None)
        items = list(expense.items.all())
        split_totals(expense.category, expense.amount, items)
        ExpenseItem.objects.bulk_update(items, ['total'])
        stock.sync_expense(expense)
        for item in items:
            if item.color_id:
                spool_sync.sync_item(item, old_qty.get(item.pk, 0), won(item.each), expense.date)
            elif item.pk in old_qty:
                spool_sync.drop(item)  # 필라멘트 항목이 품목 항목으로 바뀜 (분류 변경)
        after = snapshot(expense)
        refresh_buy_prices({key for key in before.keys() | after.keys() if before.get(key) != after.get(key)})


def snapshot(expense):
    """최근 구매가에 쓰는 값 {('color'|'part', id): (날짜, 수량 합계, 금액 합계)}.
    저장 전후를 비교해 바뀐 것만 다시 맞춘다"""
    out = {}
    for item in expense.items.all():
        _, qty, total = out.get(item_key(item), (None, Decimal(0), Decimal(0)))
        out[item_key(item)] = (expense.date, qty + item.qty, total + item.total)
    return out
