"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md). 원가 계산은 화면에서 한다 (입력 중 미리보기와 같은 계산)."""

from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from filaments.serializers import BaseModelSerializer

from .models import Category, CostSetting, Part, Product, ProductFilament, ProductPart, Subcategory


class SubcategorySerializer(BaseModelSerializer):
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Subcategory
        fields = ['id', 'category', 'name', 'product_count']
        # 이름 중복은 validate() 에서 한국어 메시지로 검사
        validators = []

    def validate_category(self, value):
        # 옮기면 그 세부 분류를 쓰는 제품의 카테고리와 어긋나므로 막는다
        if self.instance and value != self.instance.category:
            raise serializers.ValidationError('세부 분류의 카테고리는 바꿀 수 없습니다.')
        return value

    def validate(self, attrs):
        category = attrs.get('category', getattr(self.instance, 'category', None))
        name = attrs.get('name', getattr(self.instance, 'name', None))
        same = Subcategory.objects.filter(category=category, name=name)
        if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError({'name': ['이 카테고리에 같은 이름의 세부 분류가 이미 있습니다.']})
        return attrs


class CategorySerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=50,
        validators=[UniqueValidator(queryset=Category.objects.all(), message='이미 있는 카테고리 이름입니다.')],
    )
    product_count = serializers.IntegerField(read_only=True, default=0)
    subcategories = SubcategorySerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'product_count', 'subcategories']


class PartSerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=100,
        validators=[UniqueValidator(queryset=Part.objects.all(), message='이미 있는 품목입니다.')],
    )
    unit_price = serializers.SerializerMethodField()
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Part
        fields = ['id', 'name', 'shop', 'price', 'pack_qty', 'unit', 'unit_price', 'note', 'product_count']

    def get_unit_price(self, obj):
        value = obj.unit_price
        return None if value is None else round(float(value), 2)


class ProductFilamentSerializer(BaseModelSerializer):
    class Meta:
        model = ProductFilament
        fields = ['id', 'filament', 'color', 'grams']

    def validate(self, attrs):
        color = attrs.get('color')
        if color and color.filament_id != attrs['filament'].pk:
            raise serializers.ValidationError({'color': ['색상은 고른 필라멘트의 색상이어야 합니다.']})
        return attrs


class ProductPartSerializer(BaseModelSerializer):
    class Meta:
        model = ProductPart
        fields = ['id', 'part', 'qty']


class ProductSerializer(BaseModelSerializer):
    """제품 + 사용 필라멘트 · 부자재 줄.

    줄(filaments · parts)을 보내면 그 목록으로 통째로 바꾼다 (기존 줄은 지우고 새로 만듦 → 줄 id 가 바뀜).
    보내지 않으면(PATCH) 줄은 그대로.
    """

    no = serializers.IntegerField(min_value=1, required=False)
    filaments = ProductFilamentSerializer(many=True, required=False)
    parts = ProductPartSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = [
            'id',
            'no',
            'category',
            'subcategory',
            'name',
            'status',
            'print_minutes',
            'sale_price',
            'note',
            'filaments',
            'parts',
            'created_at',
            'updated_at',
        ]

    def validate_no(self, value):
        same = Product.objects.filter(no=value)
        if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError(f'No. {value} 는 이미 있습니다.')
        return value

    def validate(self, attrs):
        # 세부 분류는 그 제품의 카테고리 안에서 (Product.clean 과 같은 규칙). PATCH 면 보내지 않은 쪽은 기존 값
        category = attrs.get('category', getattr(self.instance, 'category', None))
        subcategory = attrs.get('subcategory', getattr(self.instance, 'subcategory', None))
        if subcategory and subcategory.category_id != getattr(category, 'pk', None):
            raise serializers.ValidationError({'subcategory': ['세부 분류는 고른 카테고리 안에서 골라야 합니다.']})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        filaments = validated_data.pop('filaments', [])
        parts = validated_data.pop('parts', [])
        product = Product.objects.create(**validated_data)  # No. 를 비우면 save() 가 다음 번호
        self._save_rows(product, filaments, parts)
        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        filaments = validated_data.pop('filaments', None)
        parts = validated_data.pop('parts', None)
        product = super().update(instance, validated_data)
        if filaments is not None:
            product.filaments.all().delete()
        if parts is not None:
            product.parts.all().delete()
        self._save_rows(product, filaments or [], parts or [])
        return product

    @staticmethod
    def _save_rows(product, filaments, parts):
        ProductFilament.objects.bulk_create(ProductFilament(product=product, **row) for row in filaments)
        ProductPart.objects.bulk_create(ProductPart(product=product, **row) for row in parts)


class CostSettingSerializer(BaseModelSerializer):
    class Meta:
        model = CostSetting
        fields = [
            'power_kw',
            'elec_rate',
            'printer_price',
            'printer_life_hours',
            'failure_rate',
            'fee_order',
            'fee_sales',
            'shipping_cost',
            'target_margin',
        ]
