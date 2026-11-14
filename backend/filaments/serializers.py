"""모델 ↔ JSON 변환과 입력 검사 (docs/api.md)"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.utils import timezone
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import LOGO_VALIDATORS, Brand, Color, Filament, Material, Spool, normalize_hex


class NumberField(serializers.DecimalField):
    """금액 · 무게(Decimal)를 숫자로 내보낸다. 소수점 아래가 0 이면 정수(14400), 아니면 소수(1000.5)"""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault('coerce_to_string', False)
        super().__init__(*args, **kwargs)

    def to_representation(self, value):
        value = super().to_representation(value)
        return int(value) if value == value.to_integral_value() else float(value)


class RelativeImageField(serializers.ImageField):
    """응답에 `/media/brands/x.png` 처럼 상대 주소를 준다.
    (기본은 http://127.0.0.1:8000/... 절대 주소라 프록시 · 폰 접속에서 주소가 어긋남)"""

    def to_representation(self, value):
        return value.url if value else None


class BaseModelSerializer(serializers.ModelSerializer):
    # 모델의 DecimalField 는 NumberField 로
    serializer_field_mapping = {
        **serializers.ModelSerializer.serializer_field_mapping,
        models.DecimalField: NumberField,
    }


class BrandSerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=50,
        validators=[UniqueValidator(queryset=Brand.objects.all(), message='이미 있는 회사 이름입니다.')],
    )
    # 올리기: multipart 로 파일 / 지우기: null. 줄이기 · 이전 파일 삭제는 모델(Brand.save)이 한다
    logo = RelativeImageField(required=False, allow_null=True, validators=LOGO_VALIDATORS)
    filament_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Brand
        fields = ['id', 'name', 'logo', 'filament_count']

    def validate_logo(self, value):
        # null 이면 이미지 지우기 (DB 에는 빈 문자열로 저장)
        return value or ''


class MaterialSerializer(BaseModelSerializer):
    name = serializers.CharField(
        max_length=50,
        validators=[UniqueValidator(queryset=Material.objects.all(), message='이미 있는 재질입니다.')],
    )
    filament_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Material
        fields = ['id', 'name', 'filament_count']


class ColorSerializer(BaseModelSerializer):
    # 원가 계산의 스풀 가격 = 보유 스풀 평균(held_price), 없으면 등록 가격(색상 가격 → 필라멘트 가격)
    spool_price = NumberField(max_digits=10, decimal_places=0, read_only=True)
    held_price = NumberField(max_digits=10, decimal_places=0, read_only=True)
    price_per_g = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()

    class Meta:
        model = Color
        fields = ['id', 'filament', 'name', 'hex', 'price', 'spool_price', 'held_price', 'price_per_g', 'counts']
        # 이름 중복은 validate() 에서 한국어 메시지로 검사
        validators = []

    def get_price_per_g(self, obj):
        value = obj.price_per_g
        return None if value is None else round(float(value), 2)

    def get_counts(self, obj):
        return {'sealed': obj.sealed_count, 'open': obj.open_count, 'empty': obj.empty_count}

    def validate_hex(self, value):
        try:
            return normalize_hex(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages) from e

    def validate(self, attrs):
        filament = attrs.get('filament', getattr(self.instance, 'filament', None))
        name = attrs.get('name', getattr(self.instance, 'name', None))
        same = Color.objects.filter(filament=filament, name=name)
        if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError({'name': ['이 필라멘트에 같은 이름의 색상이 이미 있습니다.']})
        return attrs


class FilamentSerializer(BaseModelSerializer):
    display_name = serializers.CharField(read_only=True)
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)
    avg_held_price = serializers.SerializerMethodField()
    colors = ColorSerializer(many=True, read_only=True)

    class Meta:
        model = Filament
        fields = [
            'id',
            'brand',
            'brand_name',
            'material',
            'material_name',
            'series',
            'display_name',
            'price',
            'spool_g',
            'avg_held_price',
            'colors',
        ]
        validators = []

    def get_avg_held_price(self, obj):
        """보유(재고 + 사용 중) 스풀의 실제 구매가 평균 (PRD INV-08), 원 단위 반올림. 없으면 None. 뷰의 annotate"""
        value = obj.avg_held_price
        return None if value is None else round(float(value))

    def validate(self, attrs):
        def current(field, instance_attr=None, default=None):
            # 보낸 값이 있으면 그것, 없으면(PATCH) 기존 값. 회사 · 재질은 id 만 쓴다 (객체를 불러오는 쿼리 없이)
            return attrs.get(field, getattr(self.instance, instance_attr or field, default))

        same = Filament.objects.filter(
            brand=current('brand', 'brand_id'),
            material=current('material', 'material_id'),
            series=current('series', default=''),
        )
        if self.instance:  # 수정(PATCH)일 때는 자기 자신 제외
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError({'series': ['같은 회사·재질·시리즈의 필라멘트가 이미 있습니다.']})
        return attrs


class SpoolSerializer(BaseModelSerializer):
    code = serializers.CharField(read_only=True)
    code_no = serializers.IntegerField(min_value=1, required=False)

    class Meta:
        model = Spool
        fields = [
            'id',
            'code',
            'code_no',
            'color',
            'status',
            'price',
            'purchased_at',
            'opened_at',
            'finished_at',
            'note',
            'buy',
            'label_printed',
        ]
        validators = []
        extra_kwargs = {'buy': {'error_messages': {'does_not_exist': '없는 구매 항목입니다.'}}}

    def validate_code_no(self, value):
        if self.instance and value != self.instance.code_no:
            raise serializers.ValidationError('스풀 번호는 바꿀 수 없습니다.')
        if not self.instance and Spool.objects.filter(code_no=value).exists():
            raise serializers.ValidationError(f'{Spool(code_no=value).code} 는 이미 있습니다.')
        return value

    def validate_buy(self, value):
        # 주문(지출 구매 항목)은 지출을 저장할 때 정해진다.
        # 만든 뒤에는 못 바꾸고, 만들 때 보내는 건 되돌리기(지운 스풀 다시 만들기)용
        if self.instance and value != self.instance.buy:
            raise serializers.ValidationError('주문은 바꿀 수 없습니다.')
        return value

    def validate_price(self, value):
        # 지출로 생긴 스풀의 구매가는 지출에서만 (현금 기준 지출 합계와 손익 기준 스풀 구매가 합계가 같게, TBD-33)
        if self.instance and self.instance.buy_id and value != self.instance.price:
            raise serializers.ValidationError('지출로 생긴 스풀은 구매가를 지출에서 고쳐요.')
        return value

    def update(self, instance, validated_data):
        """상태만 바꾸면 날짜 규칙(PRD 3.4)을 적용. 날짜를 같이 보내면(되돌리기·세부 조정) 보낸 값 그대로"""
        status = validated_data.get('status')
        dates_given = 'opened_at' in validated_data or 'finished_at' in validated_data
        if status and status != instance.status and not dates_given:
            instance.set_status(validated_data.pop('status'))
        return super().update(instance, validated_data)


class ScanSpoolSerializer(SpoolSerializer):
    """폰 스풀 화면 (QR 라벨을 찍으면, v2 TBD-18): 스풀 + 색상 · 필라멘트 이름 · 주문(지출) — 한 번에 그리도록"""

    color_name = serializers.CharField(source='color.name', read_only=True)
    color_hex = serializers.CharField(source='color.hex', read_only=True)
    filament_name = serializers.CharField(source='color.filament.display_name', read_only=True)
    order = serializers.SerializerMethodField()

    class Meta(SpoolSerializer.Meta):
        fields = [*SpoolSerializer.Meta.fields, 'color_name', 'color_hex', 'filament_name', 'order']

    def get_order(self, obj):
        """지출로 생긴 스풀이면 그 지출 {expense, date, name}, 재고 추가로 넣은 스풀이면 None"""
        if not obj.buy_id:
            return None
        expense = obj.buy.expense
        return {'expense': expense.id, 'date': expense.date, 'name': expense.name}


class LabelsSerializer(serializers.Serializer):
    """라벨 뽑음 표시 (v2 TBD-18) {ids: [3, 4], printed: true}. printed=false 는 되돌리기용"""

    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=500)
    printed = serializers.BooleanField(default=True)


class PurchaseSerializer(serializers.Serializer):
    """재고 추가 입력 (PRD INV-02)"""

    quantity = serializers.IntegerField(min_value=1, max_value=100)
    purchased_at = serializers.DateField(default=timezone.localdate)
    # 비우면 색상 가격 (없으면 필라멘트 가격)
    price = NumberField(max_digits=10, decimal_places=0, min_value=0, required=False, allow_null=True)


class SpoolIdsSerializer(serializers.Serializer):
    """여러 개 삭제 쿼리 파라미터 ?ids=3,4,5 → [3, 4, 5]. 한 번에 100개까지 (재고 추가 한도와 같음)"""

    ids = serializers.CharField()

    def validate_ids(self, value):
        try:
            ids = [int(part) for part in value.split(',')]
        except ValueError as e:
            raise serializers.ValidationError('스풀 id 를 쉼표로 구분해 주세요. (예: 3,4,5)') from e
        if len(ids) > 100:
            raise serializers.ValidationError('한 번에 100개까지 삭제할 수 있습니다.')
        return ids


class SpoolFilterSerializer(serializers.Serializer):
    """스풀 목록 쿼리 파라미터 ?color=3&status=sealed"""

    color = serializers.IntegerField(required=False)
    status = serializers.ChoiceField(choices=Spool.Status.choices, required=False)


class SpoolCodeSerializer(serializers.Serializer):
    """경로의 스풀 코드 /spools/code/S00012/ → 스풀 번호(12)로 바꿔 둔다"""

    code = serializers.CharField()

    def validate_code(self, value):
        try:
            return Spool.code_no_from_code(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e)) from e
