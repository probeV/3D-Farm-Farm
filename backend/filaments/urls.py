import copy

from rest_framework.routers import DefaultRouter

from . import views


class Router(DefaultRouter):
    """DRF 기본 라우터 + 목록 주소의 DELETE (/spools/?ids=3,4,5 → bulk_destroy).

    기본 라우터는 목록 주소에 GET(list) · POST(create) 만 연결한다.
    bulk_destroy 메서드가 있는 뷰셋에만 DELETE 가 생긴다 (지금은 스풀만).
    """

    routes = copy.deepcopy(DefaultRouter.routes)
    routes[0].mapping['delete'] = 'bulk_destroy'  # routes[0] = 목록 주소 ^{prefix}/$


router = Router()
router.register('brands', views.BrandViewSet)
router.register('materials', views.MaterialViewSet)
router.register('filaments', views.FilamentViewSet)
router.register('colors', views.ColorViewSet)
router.register('spools', views.SpoolViewSet, basename='spool')

urlpatterns = router.urls
