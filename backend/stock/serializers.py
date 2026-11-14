"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "재고 관리").

남은 수량(stock)은 시리얼라이저가 직접 바꾸지 않는다 — 처음 등록 · 조정 · 다 씀은 services.move() 로 (기록과 함께).
"""

from decimal import Decimal

from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from filaments.models import LOGO_VALIDATORS
from filaments.serializers import BaseModelSerializer, NumberField, RelativeImageField

from . import services
from .models import PackSet, PackSetLine, Part, PartCategory, PartKind, StockHistory

QTY = dict(max_digits=12, decimal_places=2)


def check_kind_unchanged(serializer, value):
    """종류(탭)는 처음 만들 때만 정한다 — 바꾸면 쓰던 곳(제품 · 세트 · 판매)과 어긋나므로"""
    if serializer.instance and value != serializer.instance.kind:
        raise serializers.ValidationError('종류는 바꿀 수 없습니다.')
    return value


class PartCategorySerializer(BaseModelSerializer):
    part_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = PartCategory
        fields = ['id', 'kind', 'name', 'part_count']
        # 이름 중복(탭 안에서)은 validate() 에서 한국어 메시지로 검사
        validators = []
        extra_kwargs = {'kind': {'error_messages': {'invalid_choice': '없는 종류입니다.'}}}

    def validate_kind(self, value):
        return check_kind_unchanged(self, value)

    def validate(self, attrs):
        kind = attrs.get('kind', getattr(self.instance, 'kind', PartKind.PART))
        name = attrs.get('name', getattr(self.instance, 'name', None))
        same = PartCategory.objects.filter(kind=kind, name=name)
        if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError({'name': ['이미 있는 카테고리 이름입니다.']})
        return attrs


class PartSerializer(BaseModelSerializer):
    """재고 품목 (부속품 · 포장재 · 소모품). 사진은 multipart 로 올리고 null 로 지운다 (회사 로고와 같은 방식).

    `stock` 은 추가할 때만 받는다 (지금 수량 → `조정 · 처음 수량` 기록). 그 뒤로는 조정 · 다 씀 API 로만.
    """

    name = serializers.CharField(
        max_length=100,
        validators=[UniqueValidator(queryset=Part.objects.all(), message='이미 있는 품목입니다.')],
    )
    photo = RelativeImageField(required=False, allow_null=True, validators=LOGO_VALIDATORS)
    stock = NumberField(**QTY, required=False, default=Decimal(0))
    # 개당 단가 = 평균 단가(이동평균, 원가 계산 · 판매 · 손익). 평균이 없으면 직접 넣은 구매가 ÷ 묶음 수량
    unit_price = serializers.SerializerMethodField()
    avg_price = serializers.SerializerMethodField()
    # 뷰의 queryset 이 붙인 값 (아래 views.parts_with_counts)
    product_count = serializers.IntegerField(read_only=True, default=0)
    set_count = serializers.IntegerField(read_only=True, default=0)
    last_used = serializers.DateField(read_only=True, default=None)
    # 지출로 산 적이 있는지 (뷰의 queryset 이 붙인 값). 있으면 구매가 · 묶음 수량은 잠김 — 단가는 평균만
    bought = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Part
        fields = [
            'id',
            'kind',
            'name',
            'category',
            'photo',
            'shop',
            'buy_url',
            'price',
            'pack_qty',
            'unit',
            'unit_price',
            'avg_price',
            'stock',
            'alert',
            'note',
            'product_count',
            'set_count',
            'last_used',
            'bought',
        ]
        extra_kwargs = {
            'kind': {'error_messages': {'invalid_choice': '없는 종류입니다.'}},
            'buy_url': {'error_messages': {'invalid': 'https:// 로 시작하는 주소로 입력하세요.'}},
        }

    @staticmethod
    def money(value):
        return None if value is None else round(float(value), 2)

    def get_unit_price(self, obj):
        return self.money(obj.unit_price)

    def get_avg_price(self, obj):
        return self.money(obj.avg_price)

    def validate_kind(self, value):
        return check_kind_unchanged(self, value)

    def validate_photo(self, value):
        # null 이면 사진 지우기 (DB 에는 빈 문자열로 저장)
        return value or ''

    def validate(self, attrs):
        if self.instance and 'stock' in self.initial_data:
            raise serializers.ValidationError({'stock': ['남은 수량은 조정으로 바꾸세요.']})
        kind = attrs.get('kind', getattr(self.instance, 'kind', PartKind.PART))
        category = attrs.get('category', getattr(self.instance, 'category', None))
        if category and category.kind != kind:
            raise serializers.ValidationError({'category': ['같은 탭의 카테고리를 고르세요.']})
        # 지출로 산 품목의 구매가 · 묶음 수량은 못 고침 — 단가는 지출 기록으로 계산한 평균 (직접 넣은 값은 쓰지 않음)
        if self.instance and self.instance.buy_items.exists():
            locked = {
                k: '지출로 산 품목은 지출에서 바꾸세요.'
                for k in ('price', 'pack_qty')
                if k in attrs and attrs[k] != getattr(self.instance, k)
            }
            if locked:
                raise serializers.ValidationError({k: [v] for k, v in locked.items()})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        stock = validated_data.pop('stock', 0)
        part = super().create(validated_data)
        services.move(part, StockHistory.Kind.ADJUST, stock, services.START_NOTE)
        return part

    @transaction.atomic
    def update(self, instance, validated_data):
        validated_data.pop('stock', None)
        part = super().update(instance, validated_data)
        # 지출로 산 적이 없는 품목은 직접 넣은 구매가가 처음 수량의 단가 → 평균도 다시
        services.recalc(part)
        return part


class AdjustSerializer(serializers.Serializer):
    """조정 창 (STOCK-04): `set` 실제 수량으로 맞추기 · `sub` 빼기 · `add` 더하기 + 사유"""

    mode = serializers.ChoiceField(
        choices=['set', 'sub', 'add'], error_messages={'invalid_choice': '맞추기 · 빼기 · 더하기 중에서 고르세요.'}
    )
    qty = NumberField(**QTY, min_value=0)
    note = serializers.CharField(max_length=180, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['mode'] != 'set' and not attrs['qty']:
            raise serializers.ValidationError({'qty': ['0 보다 큰 수량을 넣으세요.']})
        return attrs


class UseSerializer(serializers.Serializer):
    """소모품 `1개 다 씀` (STOCK-07). 사유는 선택 (예: 막힘)"""

    note = serializers.CharField(max_length=180, required=False, allow_blank=True, default='')


class StockHistorySerializer(BaseModelSerializer):
    class Meta:
        model = StockHistory
        fields = ['id', 'date', 'kind', 'qty', 'after', 'note', 'sale', 'expense', 'created_at']


class PackSetLineSerializer(BaseModelSerializer):
    qty = NumberField(**QTY, min_value=Decimal('0.01'))

    class Meta:
        model = PackSetLine
        fields = ['id', 'part', 'qty']
        extra_kwargs = {'part': {'error_messages': {'does_not_exist': '없는 포장재입니다.'}}}

    def validate_part(self, value):
        if value.kind != PartKind.PACK:
            raise serializers.ValidationError('포장재만 고를 수 있습니다.')
        return value


class PackSetSerializer(BaseModelSerializer):
    """포장 세트 + 들어가는 포장재 줄. 줄을 보내면 통째로 바꾼다 (같은 포장재 줄은 수량을 합쳐 한 줄로).
    세트 원가 · 바로 쌀 수 있는 수는 화면이 품목 목록으로 계산한다"""

    name = serializers.CharField(
        max_length=100,
        validators=[UniqueValidator(queryset=PackSet.objects.all(), message='이미 있는 세트 이름입니다.')],
    )
    lines = PackSetLineSerializer(many=True)
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = PackSet
        fields = ['id', 'name', 'note', 'lines', 'product_count']

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError('포장재를 한 개 이상 넣으세요.')
        merged = {}
        for row in value:
            part = row['part']
            merged[part] = merged.get(part, 0) + row['qty']
        return [{'part': part, 'qty': qty} for part, qty in merged.items()]

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop('lines')
        pack_set = PackSet.objects.create(**validated_data)
        self._save_lines(pack_set, lines)
        return pack_set

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        pack_set = super().update(instance, validated_data)
        if lines is not None:
            pack_set.lines.all().delete()
            self._save_lines(pack_set, lines)
        return pack_set

    @staticmethod
    def _save_lines(pack_set, lines):
        PackSetLine.objects.bulk_create(PackSetLine(pack_set=pack_set, **row) for row in lines)
