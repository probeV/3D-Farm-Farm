from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from filaments.serializers import BaseModelSerializer, NumberField
from sales.serializers import num

from .models import StoreImport, StoreLink
from .services import MAX_DAYS, STATUS_LABEL


class StoreLinkSerializer(BaseModelSerializer):
    """상품 연결 (STORE-02). 기본 연결 줄(옵션 없음)은 가져올 때 저절로 생기고, 화면은 제품만 고른다.
    옵션 줄은 화면에서 더한다 — 같은 스토어 상품의 기본 줄이 있어야 하고, 스토어 상품명은 거기서 복사"""

    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    store_name = serializers.CharField(read_only=True)

    class Meta:
        model = StoreLink
        fields = ['id', 'store_product_id', 'store_name', 'option', 'product', 'product_name', 'updated_at']
        read_only_fields = ['updated_at']
        validators = [
            UniqueTogetherValidator(
                queryset=StoreLink.objects.all(),
                fields=['store_product_id', 'option'],
                message='이미 있는 옵션 연결입니다.',
            )
        ]

    def validate_option(self, value):
        return value.strip()

    def validate(self, attrs):
        pid = attrs.get('store_product_id', getattr(self.instance, 'store_product_id', ''))
        option = attrs.get('option', getattr(self.instance, 'option', ''))
        if self.instance is None:
            base = StoreLink.objects.filter(store_product_id=pid, option='').first()
            if base is None:
                raise serializers.ValidationError({'store_product_id': ['가져온 적이 없는 스토어 상품입니다.']})
            if not option:
                raise serializers.ValidationError({'option': ['옵션 글자를 넣으세요.']})
            attrs['store_name'] = base.store_name
        elif 'store_product_id' in attrs and attrs['store_product_id'] != self.instance.store_product_id:
            raise serializers.ValidationError({'store_product_id': ['스토어 상품은 바꿀 수 없습니다.']})
        elif (self.instance.option == '') != (option == ''):
            raise serializers.ValidationError({'option': ['기본 연결은 옵션 글자를 넣지 않아요.']})
        return attrs


class StoreImportSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreImport
        fields = ['id', 'created_at', 'date_from', 'date_to', 'added', 'updated', 'skipped', 'note']


class RangeSerializer(serializers.Serializer):
    """주문 가져오기 기간 (결제 · 변경 날짜, 한국 시간, 양 끝 포함)"""

    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, attrs):
        if attrs['date_from'] > attrs['date_to']:
            raise serializers.ValidationError({'date_from': ['시작일이 종료일보다 늦어요.']})
        if (attrs['date_to'] - attrs['date_from']).days + 1 > MAX_DAYS:
            raise serializers.ValidationError({'date_to': [f'한 번에 {MAX_DAYS}일까지 가져올 수 있어요.']})
        return attrs


class ImportSerializer(RangeSerializer):
    """판매 장부에 넣기 — 미리보기에서 고른 주문의 상품주문번호 · 화면의 원가(포장 빼고) · 미리보기 주문 수"""

    product_order_ids = serializers.ListField(child=serializers.CharField(max_length=30), min_length=1, max_length=1000)
    costs = serializers.DictField(child=NumberField(max_digits=10, decimal_places=0, allow_null=True), required=False)
    total = serializers.IntegerField(min_value=0)

    def validate_costs(self, value):
        try:
            return {int(k): v for k, v in value.items()}
        except ValueError as e:
            raise serializers.ValidationError('제품 id 가 숫자가 아닙니다.') from e


def order_json(o):
    """미리보기 주문 한 건 (services.classify 결과) → 응답"""
    status = next((x['status'] for x in o['lines'] if x['alive']), o['lines'][0]['status'])
    return {
        'order_id': o['order_id'],
        'date': o['date'],
        'kind': o['kind'],
        'manual': o['manual'],
        'sale': o['sale'].pk if o['sale'] else None,
        'status': status,
        'status_label': STATUS_LABEL.get(status, status),
        'changes': o['changes'],
        'gross': num(o['gross']),
        'shipping': num(o['shipping']),
        'fee': num(o['fee']),
        'settle': num(o['settle']),
        'naver_settle': num(o['naver_settle']),
        'lines': [
            {
                'store_item_id': x['store_item_id'],
                'store_product_id': x['store_product_id'],
                'store_name': x['store_name'],
                'option': x['option'],
                'qty': x['qty'],
                'amount': num(x['amount']),
                'status': x['status'],
                'status_label': STATUS_LABEL.get(x['status'], x['status']),
                'alive': x['alive'],
                'link': x['link'].pk if x['link'] else None,
                'product': x['product'].pk if x['product'] else None,
                'product_name': x['product'].name if x['product'] else None,
            }
            for x in o['lines']
        ],
    }
