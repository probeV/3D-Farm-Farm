"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "판매").

요약 · 제품별 판매 · 검색 · 기간 필터는 화면이 목록으로 계산한다.
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from filaments.serializers import BaseModelSerializer, NumberField
from stock import services as stock
from stock.models import PartKind

from .models import Sale, SaleChannel, SaleItem, SalePack, SalePart, default_parts, won


def num(value):
    """계산값(Decimal)을 NumberField 처럼 숫자로 (소수점 아래가 0 이면 정수). None 은 그대로"""
    if value is None:
        return None
    return int(value) if value == value.to_integral_value() else float(value)


class SaleItemSerializer(BaseModelSerializer):
    # 판매가 = 단가 × 수량 (읽기만)
    amount = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'qty', 'unit_price', 'unit_cost', 'store_item_id', 'amount']
        extra_kwargs = {
            'product': {'required': False, 'error_messages': {'does_not_exist': '없는 제품입니다.'}},
            # 스마트스토어 상품주문번호 — 줄을 고쳐 다시 만들어도 받은 값을 그대로 보내야 다음 가져오기 때 맞출 수 있다
            'store_item_id': {'required': False, 'validators': []},
            # 비우면 제품 이름을 복사 (SaleItem.save). 수정할 때 기존 줄은 받은 이름 그대로 — 팔 때 이름 유지
            'product_name': {'required': False},
        }

    def get_amount(self, obj):
        return num(obj.amount)

    def validate(self, attrs):
        # 제품을 지운 줄(product 없음)은 이름이 있어야 다시 저장할 수 있다
        if not attrs.get('product') and not attrs.get('product_name'):
            raise serializers.ValidationError({'product': ['제품을 고르세요.']})
        return attrs


class SalePartSerializer(BaseModelSerializer):
    """주문의 부속품 줄 — 이 판매로 남은 수량에서 빠지는 부속품. 부속품 탭 품목만"""

    qty = NumberField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))

    class Meta:
        model = SalePart
        fields = ['id', 'part', 'part_name', 'qty']
        extra_kwargs = {
            'part': {'required': False, 'error_messages': {'does_not_exist': '없는 부속품입니다.'}},
            'part_name': {'required': False},
        }

    def validate_part(self, value):
        if value and value.kind != PartKind.PART:
            raise serializers.ValidationError('부속품만 고를 수 있습니다.')
        return value

    def validate(self, attrs):
        if not attrs.get('part') and not attrs.get('part_name'):
            raise serializers.ValidationError({'part': ['부속품을 고르세요.']})
        return attrs


class SalePackSerializer(BaseModelSerializer):
    """주문의 포장 줄 (SALE-06). `unit_price` 를 보내지 않으면 포장재의 지금 개당 단가를 복사한다.
    수정할 때는 받은 이름 · 단가를 그대로 보내면 팔 때 값이 유지된다"""

    qty = NumberField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    unit_price = NumberField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    amount = serializers.SerializerMethodField()

    class Meta:
        model = SalePack
        fields = ['id', 'part', 'part_name', 'qty', 'unit_price', 'amount']
        extra_kwargs = {
            'part': {'required': False, 'error_messages': {'does_not_exist': '없는 포장재입니다.'}},
            'part_name': {'required': False},
        }

    def get_amount(self, obj):
        return num(obj.amount)

    def validate_part(self, value):
        if value and value.kind != PartKind.PACK:
            raise serializers.ValidationError('포장재만 고를 수 있습니다.')
        return value

    def validate(self, attrs):
        part = attrs.get('part')
        if not part and not attrs.get('part_name'):
            raise serializers.ValidationError({'part': ['포장재를 고르세요.']})
        if 'unit_price' not in attrs and part:
            price = part.unit_price
            attrs['unit_price'] = None if price is None else round(price, 2)
        return attrs


class SaleSerializer(BaseModelSerializer):
    """판매 한 건 + 그 안의 제품 줄.

    1. 제품 줄 수정: 수정할 때 items 를 보내면 기존 줄을 전부 지우고 보낸 목록으로 새로 만든다.
       예) [분수 원판 2, 키링 1] 인 주문에 [분수 원판 3] 만 보내면 → 분수 원판 3 한 줄만 남음 (줄 id 는 새 번호)
       items 를 안 보내면 줄은 그대로 (메모만 고칠 때 등)
    2. 수수료: 새로 추가할 때 fee 를 비우면 서버가 정한다 — 스마트스토어는 자동 계산, 직접 판매 · 기타는 0.
       fee 를 보내면 그 값 그대로 (손으로 고친 수수료)
    3. 합계 · 이익: gross(판매가 합계) · settle(정산 금액) · cost(원가) · profit(이익)은 저장하지 않고
       응답할 때마다 줄로 계산한다 (보내도 무시). 줄은 뷰가 목록을 읽을 때 한 번에 미리 읽어 둔다
       (prefetch_related — 판매마다 따로 조회하지 않게)
    4. 포장 줄(packs): items 와 같은 방식으로 통째로 바꾼다. 안 보내면 그대로 (추가할 때 안 보내면 포장 없음)
    5. 부속품 줄(parts): items 와 같은 방식으로 통째로 바꾼다. 추가할 때 안 보내면 제품의 사용 부속품 × 수량으로,
       수정할 때 안 보내면 그대로 (화면은 늘 보낸다 — 옵션에 따라 바꾼 부속품이 그대로 남게)
    6. 재고: 추가하거나 부속품 · 포장 줄을 바꾸면 그 줄만큼 남은 수량에서 뺀다
       (이미 뺀 만큼과 비교해 차이만, stock.sync_sale). 지울 때는 뷰가 되돌린다
    """

    items = SaleItemSerializer(many=True)
    parts = SalePartSerializer(many=True, required=False)
    packs = SalePackSerializer(many=True, required=False)
    fee = NumberField(max_digits=10, decimal_places=0, min_value=0, required=False)
    gross = serializers.SerializerMethodField()
    settle = serializers.SerializerMethodField()
    pack_cost = serializers.SerializerMethodField()
    cost = serializers.SerializerMethodField()
    profit = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'date',
            'channel',
            'order_no',
            'items',
            'parts',
            'packs',
            'shipping_received',
            'fee',
            'shipping_cost',
            'note',
            'gross',
            'settle',
            'pack_cost',
            'cost',
            'profit',
            'created_at',
        ]
        extra_kwargs = {
            'channel': {'error_messages': {'invalid_choice': '없는 판매처입니다.'}},
            # DB 제약(빈 값 제외 UNIQUE)에서 DRF 가 만드는 중복 검사 대신 validate_order_no 의 문구로
            'order_no': {'validators': []},
        }

    # ---- 읽기 전용 계산값
    @staticmethod
    def _items(obj):
        return list(obj.items.all())

    def _gross(self, obj):
        return sum((i.amount for i in self._items(obj)), Decimal(0))

    def _settle(self, obj):
        return self._gross(obj) + obj.shipping_received - obj.fee

    @staticmethod
    def _pack_cost(obj):
        """포장비 = Σ 포장 줄 단가 × 수량 (단가 없는 줄은 0), 원 단위 반올림"""
        return won(sum((p.amount or 0 for p in obj.packs.all()), Decimal(0)))

    def _cost(self, obj):
        """원가 = 제품 원가 + 포장비 (SALE-06). 원가 없는 제품 줄이 있으면 None"""
        costs = [i.cost_total for i in self._items(obj)]
        return None if any(c is None for c in costs) else sum(costs, Decimal(0)) + self._pack_cost(obj)

    def get_gross(self, obj):
        return num(self._gross(obj))

    def get_settle(self, obj):
        """정산 금액 = 판매가 합계 + 받은 배송비 − 수수료"""
        return num(self._settle(obj))

    def get_pack_cost(self, obj):
        return num(self._pack_cost(obj))

    def get_cost(self, obj):
        """원가 합계 (제품 + 포장). 원가 없는 제품 줄이 하나라도 있으면 None"""
        return num(self._cost(obj))

    def get_profit(self, obj):
        """주문별 이익 (SALE-05, 참고) = 정산 금액 − 원가(제품 + 포장) − 낸 택배비"""
        cost = self._cost(obj)
        return None if cost is None else num(self._settle(obj) - cost - obj.shipping_cost)

    # ---- 입력 검사
    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('오늘 이후 날짜는 넣을 수 없습니다.')
        return value

    def validate_order_no(self, value):
        value = value.strip()
        if value:
            same = Sale.objects.filter(order_no=value)
            if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
                same = same.exclude(pk=self.instance.pk)
            if same.exists():
                raise serializers.ValidationError('이미 넣은 주문번호입니다.')
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('제품을 한 개 이상 넣으세요.')
        return value

    # ---- 저장
    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        packs = validated_data.pop('packs', [])
        parts = validated_data.pop('parts', None)
        if parts is None:  # 안 보내면 제품의 사용 부속품 × 수량
            used = default_parts([(row.get('product'), row['qty']) for row in items])
            parts = [{'part': part, 'qty': qty} for part, qty in used.items()]
        if 'fee' not in validated_data:
            gross = sum(row['unit_price'] * row['qty'] for row in items)
            store = validated_data.get('channel', SaleChannel.STORE) == SaleChannel.STORE
            shipping = validated_data.get('shipping_received', 0)
            validated_data['fee'] = Sale.store_fee(gross, shipping) if store else 0
        sale = Sale.objects.create(**validated_data)
        self._save_items(sale, items)
        self._save_parts(sale, parts)
        self._save_packs(sale, packs)
        stock.sync_sale(sale)
        return sale

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        packs = validated_data.pop('packs', None)
        parts = validated_data.pop('parts', None)
        sale = super().update(instance, validated_data)
        if items is not None:
            sale.items.all().delete()
            self._save_items(sale, items)
        if parts is not None:
            sale.parts.all().delete()
            self._save_parts(sale, parts)
        if packs is not None:
            sale.packs.all().delete()
            self._save_packs(sale, packs)
        if parts is not None or packs is not None:
            stock.sync_sale(sale)
        return sale

    @staticmethod
    def _save_items(sale, items):
        # bulk_create 는 save() 를 거치지 않으므로 제품명 복사를 여기서
        for row in items:
            if not row.get('product_name') and row.get('product'):
                row['product_name'] = row['product'].name
        SaleItem.objects.bulk_create(SaleItem(sale=sale, **row) for row in items)
        # 응답에서 새 줄이 보이도록 미리 읽어 둔 줄을 비운다
        if hasattr(sale, '_prefetched_objects_cache'):
            sale._prefetched_objects_cache.pop('items', None)

    @staticmethod
    def _save_parts(sale, parts):
        for row in parts:
            if not row.get('part_name') and row.get('part'):
                row['part_name'] = row['part'].name
        SalePart.objects.bulk_create(SalePart(sale=sale, **row) for row in parts)
        if hasattr(sale, '_prefetched_objects_cache'):
            sale._prefetched_objects_cache.pop('parts', None)

    @staticmethod
    def _save_packs(sale, packs):
        for row in packs:
            if not row.get('part_name') and row.get('part'):
                row['part_name'] = row['part'].name
        SalePack.objects.bulk_create(SalePack(sale=sale, **row) for row in packs)
        if hasattr(sale, '_prefetched_objects_cache'):
            sale._prefetched_objects_cache.pop('packs', None)
