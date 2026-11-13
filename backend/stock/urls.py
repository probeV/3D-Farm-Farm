from rest_framework.routers import SimpleRouter

from . import views

# /api/v0/ 의 API 목록 화면은 filaments 라우터가 맡으므로 여기는 SimpleRouter
# 부속품 바꾸기(parts/{id}/replace/)는 제품의 줄을 바꾸는 동작이라 products/urls.py
router = SimpleRouter()
router.register('part-categories', views.PartCategoryViewSet)
router.register('parts', views.PartViewSet)
router.register('pack-sets', views.PackSetViewSet)

urlpatterns = router.urls
