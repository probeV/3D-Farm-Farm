"""재고 관리 JSON API (/api/v0/, docs/api.md)."""

from django.db.models import Count

from filaments.views import BaseViewSet

from .models import Part, PartCategory
from .serializers import PartCategorySerializer, PartSerializer

# 주의: annotate(Count) 를 쓰면 모델 Meta.ordering 이 무시되므로 order_by 를 직접 붙인다


class PartCategoryViewSet(BaseViewSet):
    """부자재 카테고리. 지우면 그 부자재는 미분류 (SET_NULL, 막는 것 없음)"""

    queryset = PartCategory.objects.annotate(part_count=Count('parts')).order_by('name')
    serializer_class = PartCategorySerializer


class PartViewSet(BaseViewSet):
    # 같은 제품에 같은 부자재를 두 줄 둘 수도 있으므로 제품 수는 distinct
    queryset = Part.objects.annotate(product_count=Count('product_parts__product', distinct=True)).order_by('name')
    serializer_class = PartSerializer
    protected_message = '제품에서 쓰고 있어서 삭제할 수 없습니다.'
