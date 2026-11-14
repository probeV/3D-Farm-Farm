"""스마트스토어 연동 JSON API (/api/v0/store/…, docs/api.md "스마트스토어 연동").

연결 상태(STORE-04) · 상품 연결(STORE-02) · 주문 미리보기 · 판매 장부에 넣기(STORE-03) · 가져오기 기록(STORE-05).
네이버를 부르는 곳은 connection · orders 뿐. 키 · 토큰은 응답에 넣지 않는다
"""

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from filaments.views import BaseViewSet

from . import naver, services
from .models import StoreImport, StoreLink
from .serializers import ImportSerializer, RangeSerializer, StoreImportSerializer, StoreLinkSerializer, order_json


def _naver_error(e):
    """NoKey → 409 state nokey, NaverError → 502 state fail"""
    if isinstance(e, naver.NoKey):
        return Response(
            {'state': 'nokey', 'detail': '애플리케이션 ID · 시크릿이 없어요.'}, status=status.HTTP_409_CONFLICT
        )
    return Response({'state': 'fail', 'detail': str(e)}, status=status.HTTP_502_BAD_GATEWAY)


def _last_import():
    last = StoreImport.objects.first()
    return StoreImportSerializer(last).data if last else None


@api_view(['GET', 'POST'])
def connection(request):
    """GET: 연결 상태 (토큰을 받아 둔 게 있으면 그대로) · POST: `연결 확인` (토큰을 새로 받아 봄)
    → {state: ok | nokey | fail, detail, last_import}"""
    try:
        naver.check() if request.method == 'POST' else naver.token()
    except (naver.NoKey, naver.NaverError) as e:
        res = _naver_error(e)
        return Response({**res.data, 'last_import': _last_import()})
    return Response({'state': 'ok', 'detail': '', 'last_import': _last_import()})


@api_view(['GET', 'POST'])
def orders(request):
    """GET ?date_from=&date_to=: 미리보기 (그 기간에 바뀐 주문, 처음 보는 스토어 상품은 연결 줄을 만듦)
    POST: 고른 주문을 판매 장부에 넣고 · 맞추고 기록을 남김 → 기록 한 줄"""
    data = (RangeSerializer if request.method == 'GET' else ImportSerializer)(
        data=request.query_params if request.method == 'GET' else request.data
    )
    data.is_valid(raise_exception=True)
    v = data.validated_data
    try:
        if request.method == 'GET':
            return Response({'orders': [order_json(o) for o in services.preview(v['date_from'], v['date_to'])]})
        record = services.apply(v['date_from'], v['date_to'], v['product_order_ids'], v.get('costs', {}), v['total'])
    except (naver.NoKey, naver.NaverError) as e:
        return _naver_error(e)
    return Response(StoreImportSerializer(record).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def imports(request):
    """가져오기 기록 최근 20줄"""
    return Response(StoreImportSerializer(StoreImport.objects.all()[:20], many=True).data)


class StoreLinkViewSet(BaseViewSet):
    """상품 연결. 기본 연결 줄(옵션 없음)은 지울 수 없다 (제품만 비움)"""

    queryset = StoreLink.objects.select_related('product').order_by('store_name', 'store_product_id', 'option')
    serializer_class = StoreLinkSerializer

    def destroy(self, request, *args, **kwargs):
        if self.get_object().option == '':
            return Response(
                {'detail': '기본 연결은 지울 수 없어요. 제품을 비우세요.'}, status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
