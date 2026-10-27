"""제품 원가 JSON API (/api/v0/, docs/api.md).

화면은 제품 목록 + 필라멘트 목록(/filaments/) + 부자재 + 설정을 받아 원가 · 순마진율 · 요약 · CSV 를 직접 계산한다.
"""

from django.db import transaction
from django.db.models import Count, Prefetch
from rest_framework import generics, status
from rest_framework.decorators import action
from rest_framework.response import Response

from filaments.views import BaseViewSet

from .models import Category, CostSetting, Part, PartCategory, Product, ProductPart, Subcategory
from .serializers import (
    CategorySerializer,
    CostSettingSerializer,
    PartCategorySerializer,
    PartSerializer,
    ProductSerializer,
    ReplacePartSerializer,
    SubcategorySerializer,
)

# 주의: annotate(Count) 를 쓰면 모델 Meta.ordering 이 무시되므로 order_by 를 직접 붙인다


def subcategories_with_counts():
    return Subcategory.objects.annotate(product_count=Count('products')).order_by('category_id', 'name')


class CategoryViewSet(BaseViewSet):
    """카테고리 + 그 안의 세부 분류 (제품 관리 창 왼쪽)"""

    queryset = (
        Category.objects.annotate(product_count=Count('products'))
        .prefetch_related(Prefetch('subcategories', queryset=subcategories_with_counts()))
        .order_by('name')
    )
    serializer_class = CategorySerializer
    # 세부 분류에만 제품이 있어도 막힌다 (세부 분류는 카테고리와 함께 지워지므로)
    protected_message = '제품이 있어서 삭제할 수 없습니다.'


class SubcategoryViewSet(BaseViewSet):
    queryset = subcategories_with_counts()
    serializer_class = SubcategorySerializer
    protected_message = '제품이 있어서 삭제할 수 없습니다.'


class PartCategoryViewSet(BaseViewSet):
    """부자재 카테고리. 지우면 그 부자재는 미분류 (SET_NULL, 막는 것 없음)"""

    queryset = PartCategory.objects.annotate(part_count=Count('parts')).order_by('name')
    serializer_class = PartCategorySerializer


class PartViewSet(BaseViewSet):
    # 같은 제품에 같은 부자재를 두 줄 둘 수도 있으므로 제품 수는 distinct
    queryset = Part.objects.annotate(product_count=Count('product_parts__product', distinct=True)).order_by('name')
    serializer_class = PartSerializer
    protected_message = '제품에서 쓰고 있어서 삭제할 수 없습니다.'

    # POST /parts/{id}/replace/ {to, products?} — 제품에서 쓰는 이 부자재 줄을 다른 부자재로 (TBD-23)
    @action(detail=True, methods=['post'])
    @transaction.atomic  # 하나라도 실패하면 아무것도 바꾸지 않음
    def replace(self, request, pk=None):
        """제품의 부자재 바꾸기 → {replaced: 바꾼 제품 수}.
        수량은 그대로, 그 제품에 이미 바꿀 부자재가 있으면 수량을 더해 한 줄로"""
        part = self.get_object()
        data = ReplacePartSerializer(data=request.data, context={'part': part})
        data.is_valid(raise_exception=True)
        to = data.validated_data['to']
        products = data.validated_data.get('products')
        rows = ProductPart.objects.select_related('product').filter(part=part)
        if products is not None:
            rows = rows.filter(product_id__in=products)
        replaced = set()
        for row in rows:
            same = ProductPart.objects.filter(product=row.product, part=to).first()
            if same:
                same.qty += row.qty
                same.save(update_fields=['qty'])
                row.delete()
            else:
                row.part = to
                row.save(update_fields=['part'])
            replaced.add(row.product_id)
        return Response({'replaced': len(replaced)}, status=status.HTTP_200_OK)


class ProductViewSet(BaseViewSet):
    """제품 목록 = 제품 원가 화면에 필요한 제품 데이터 전부 (사용 필라멘트 · 부자재 줄 포함)"""

    queryset = Product.objects.prefetch_related('filaments', 'parts').order_by('no')
    serializer_class = ProductSerializer


class CostSettingView(generics.RetrieveUpdateAPIView):
    """원가 설정 (항상 1개). GET / PATCH /cost-setting/"""

    serializer_class = CostSettingSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_object(self):
        return CostSetting.load()
