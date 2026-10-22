"""제품 원가 JSON API (/api/v0/, docs/api.md).

화면은 제품 목록 + 필라멘트 목록(/filaments/) + 부자재 + 설정을 받아 원가 · 순마진율 · 요약 · CSV 를 직접 계산한다.
"""

from django.db.models import Count, Prefetch
from rest_framework import generics

from filaments.views import BaseViewSet

from .models import Category, CostSetting, Part, Product, Subcategory
from .serializers import (
    CategorySerializer,
    CostSettingSerializer,
    PartSerializer,
    ProductSerializer,
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


class PartViewSet(BaseViewSet):
    # 같은 제품에 같은 부자재를 두 줄 둘 수도 있으므로 제품 수는 distinct
    queryset = Part.objects.annotate(product_count=Count('product_parts__product', distinct=True)).order_by('name')
    serializer_class = PartSerializer
    protected_message = '제품에서 쓰고 있어서 삭제할 수 없습니다.'


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
