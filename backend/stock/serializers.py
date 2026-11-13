"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md "재고 관리")."""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from filaments.serializers import BaseModelSerializer

from .models import Part, PartCategory


class PartCategorySerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=50,
        validators=[UniqueValidator(queryset=PartCategory.objects.all(), message='이미 있는 카테고리 이름입니다.')],
    )
    part_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = PartCategory
        fields = ['id', 'name', 'part_count']


class PartSerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=100,
        validators=[UniqueValidator(queryset=Part.objects.all(), message='이미 있는 품목입니다.')],
    )
    unit_price = serializers.SerializerMethodField()
    product_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Part
        fields = [
            'id',
            'name',
            'category',
            'shop',
            'buy_url',
            'price',
            'pack_qty',
            'unit',
            'unit_price',
            'note',
            'product_count',
        ]
        extra_kwargs = {'buy_url': {'error_messages': {'invalid': 'https:// 로 시작하는 주소로 입력하세요.'}}}

    def get_unit_price(self, obj):
        value = obj.unit_price
        return None if value is None else round(float(value), 2)
