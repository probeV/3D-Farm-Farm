"""필라멘트 JSON API (/api/v0/, docs/api.md). 스풀 하나로 끝나는 규칙은 모델에, 여러 행을 함께 바꾸는 동작은 여기서."""

from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count, Prefetch, ProtectedError, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404  # 숫자가 아닌 id 도 404 (Django 것은 500)
from rest_framework.response import Response

from expenses.models import last_buy_annotations

from .models import Brand, Color, Filament, Material, Spool
from .serializers import (
    BrandSerializer,
    ColorSerializer,
    FilamentSerializer,
    LabelsSerializer,
    MaterialSerializer,
    PurchaseSerializer,
    ScanSpoolSerializer,
    SpoolCodeSerializer,
    SpoolFilterSerializer,
    SpoolIdsSerializer,
    SpoolSerializer,
)

# 주의: annotate(Count/Avg) 를 쓰면 모델 Meta.ordering 이 무시되므로 order_by 를 직접 붙인다


def colors_with_counts():
    """색상 + 상태별 스풀 개수를 한 번의 쿼리로"""
    return (
        Color.objects.select_related('filament')
        .annotate(
            sealed_count=Count('spools', filter=Q(spools__status=Spool.Status.SEALED)),
            open_count=Count('spools', filter=Q(spools__status=Spool.Status.OPEN)),
            empty_count=Count('spools', filter=Q(spools__status=Spool.Status.EMPTY)),
            **last_buy_annotations('color'),
        )
        .order_by('filament_id', 'id')
    )


class BaseViewSet(viewsets.ModelViewSet):
    # 수정은 PATCH 만 (전체 교체 PUT 은 쓰지 않음)
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']
    # 경로의 id 검사: 숫자가 아니거나 없는 id 면 DRF(get_object)가 JSON 404 로 답한다.
    # (lookup_value_regex 로 URL 에서 막으면 Django 의 HTML 404 페이지가 나가서 쓰지 않음)
    # 다른 데이터가 이 행을 쓰고 있어서 지울 수 없을 때 (on_delete=PROTECT) 보여줄 문구
    protected_message = '다른 데이터에서 쓰고 있어서 삭제할 수 없습니다.'
    # 막은 데이터 종류마다 문구를 다르게 할 때 {'앱.모델': 문구}. 다른 앱 모델은 import 하지 않고 이름으로
    protected_messages = {}

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError as e:
            blocker = next(iter(e.protected_objects))._meta.label
            message = self.protected_messages.get(blocker, self.protected_message)
            return Response({'detail': message}, status=status.HTTP_409_CONFLICT)


class BrandViewSet(BaseViewSet):
    queryset = Brand.objects.annotate(filament_count=Count('filaments')).order_by('name')
    serializer_class = BrandSerializer
    protected_message = '필라멘트가 있어서 삭제할 수 없습니다.'


class MaterialViewSet(BaseViewSet):
    queryset = Material.objects.annotate(filament_count=Count('filaments')).order_by('name')
    serializer_class = MaterialSerializer
    protected_message = '필라멘트에서 쓰고 있어서 삭제할 수 없습니다.'


class FilamentViewSet(BaseViewSet):
    """필라멘트 목록 = 필라멘트 화면에 필요한 전부 (색상 · 상태별 개수 · 보유 스풀 평균 구매가).
    전체 요약 · 회사별 kg · 검색 · 정렬은 화면에서 이 목록으로 계산한다."""

    queryset = (
        Filament.objects.select_related('brand', 'material')
        .annotate(
            avg_held_price=Avg(
                'colors__spools__price',
                filter=Q(colors__spools__status__in=[Spool.Status.SEALED, Spool.Status.OPEN]),
            )
        )
        .prefetch_related(Prefetch('colors', queryset=colors_with_counts()))
        .order_by('brand__name', 'material__name', 'series')
    )
    serializer_class = FilamentSerializer
    protected_message = '색상이 있어서 삭제할 수 없습니다.'
    protected_messages = {'products.ProductFilament': '제품에서 쓰고 있어서 삭제할 수 없습니다.'}

    # POST /filaments/
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filament = serializer.save()
        filament = self.get_queryset().get(pk=filament.pk)  # 응답용 다시 조회 (평균 + 색상 + 개수)
        return Response(self.get_serializer(filament).data, status=status.HTTP_201_CREATED)

    # PATCH /filaments/{id}/
    def partial_update(self, request, pk=None):
        filament = get_object_or_404(Filament, pk=pk)  # 수정할 대상은 한 줄만 (평균 · 색상 필요 없음)
        serializer = self.get_serializer(filament, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        filament = self.get_queryset().get(pk=filament.pk)  # 응답용 다시 조회 (평균 + 색상 + 개수)
        return Response(self.get_serializer(filament).data)


class ColorViewSet(BaseViewSet):
    queryset = colors_with_counts()
    serializer_class = ColorSerializer
    # 삭제: 스풀은 함께 삭제, 제품 줄은 색상 선택 안 함으로 (막는 것 없음, PRD FIL-09)

    # POST /colors/ — 새 색상은 개수가 붙어 있지 않으므로 queryset(개수 포함)으로 다시 조회해서 응답.
    # 수정(PATCH)은 기본 동작 그대로: 조회한 객체에 붙은 개수가 남아 있음
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        color = serializer.save()
        color = self.get_queryset().get(pk=color.pk)  # 응답용 다시 조회 (개수 포함)
        return Response(self.get_serializer(color).data, status=status.HTTP_201_CREATED)

    # POST /colors/{id}/spools/  (이 색상에 스풀들을 만든다 = 재고 추가)
    @action(detail=True, methods=['post'], url_path='spools')
    @transaction.atomic  # 번호 받기 ~ 저장을 한 트랜잭션으로
    def purchase(self, request, pk=None):
        """재고 추가 (PRD INV-02) → 만든 스풀 목록. 지출 없이 들어온 스풀(선물 · 예전 재고)용 —
        산 스풀은 필라멘트 지출을 저장하면 생긴다 (TBD-33). 번호는 항상 다음 번호부터 (지운 번호는 다시 안 씀)"""
        # 개수는 필요 없음. 색상 가격이 비면 필라멘트 가격을 쓰므로 필라멘트만 같이
        color = get_object_or_404(Color.objects.select_related('filament'), pk=pk)
        data = PurchaseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        price = data.validated_data.get('price')
        if price is None:  # 가격을 비우면 색상 가격 (없으면 필라멘트 가격)
            price = color.spool_price
        numbers = Spool.take_code_nos(data.validated_data['quantity'])
        # bulk_create 는 save() 를 거치지 않으므로 번호를 직접 넣는다
        Spool.objects.bulk_create(
            Spool(
                color=color,
                code_no=n,
                status=Spool.Status.SEALED,
                price=price,
                purchased_at=data.validated_data['purchased_at'],
            )
            for n in numbers
        )
        spools = Spool.objects.filter(code_no__in=numbers).order_by('code_no')
        return Response(SpoolSerializer(spools, many=True).data, status=status.HTTP_201_CREATED)


class SpoolViewSet(BaseViewSet):
    serializer_class = SpoolSerializer

    def get_queryset(self):
        spools = Spool.objects.order_by('code_no')
        if self.action != 'list':
            return spools
        # 목록만: ?color=3&status=sealed 로 거르기 (스풀 선택 · 조정 창). 틀린 값이면 400
        params = SpoolFilterSerializer(data=self.request.query_params)
        params.is_valid(raise_exception=True)
        if 'color' in params.validated_data:
            spools = spools.filter(color_id=params.validated_data['color'])
        if 'status' in params.validated_data:
            spools = spools.filter(status=params.validated_data['status'])
        return spools

    # DELETE /spools/?ids=3,4,5  (urls.py 의 Router 가 목록 주소의 DELETE 를 여기로 연결)
    def bulk_destroy(self, request):
        """여러 개 삭제 (재고 추가 되돌리기). 한 번에 100개까지"""
        params = SpoolIdsSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        deleted, _ = Spool.objects.filter(pk__in=params.validated_data['ids']).delete()
        return Response({'deleted': deleted})

    @action(detail=False, methods=['get'], url_path=r'code/(?P<code>[^/]+)')
    def by_code(self, request, code=None):
        """스풀 코드로 찾기 (PRD INV-09): S00012. 형식이 틀리면 400, 없으면 404.
        폰 스풀 화면(QR 라벨을 찍으면, TBD-18)도 이것 — 색상 · 필라멘트 이름 · 주문(지출)을 함께 준다"""
        params = SpoolCodeSerializer(data={'code': code})
        params.is_valid(raise_exception=True)
        spools = Spool.objects.select_related('color__filament__brand', 'color__filament__material', 'buy__expense')
        return Response(ScanSpoolSerializer(get_object_or_404(spools, code_no=params.validated_data['code'])).data)

    # GET · POST /spools/labels/
    @action(detail=False, methods=['get', 'post'])
    def labels(self, request):
        """QR 라벨 (v2 TBD-18). GET: QR 안의 주소 앞부분 {public_url} (backend/.env 의 PUBLIC_URL, 없으면 "").
        POST {ids, printed}: 인쇄한 스풀을 `라벨 뽑음` 으로 (printed=false 는 되돌리기) → {updated}"""
        if request.method == 'GET':
            return Response({'public_url': settings.PUBLIC_URL})
        data = LabelsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        updated = Spool.objects.filter(pk__in=data.validated_data['ids']).update(
            label_printed=data.validated_data['printed']
        )
        return Response({'updated': updated})
