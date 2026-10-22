from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

# /api/v0/ 의 API 목록 화면은 filaments 라우터가 맡으므로 여기는 SimpleRouter
router = SimpleRouter()
router.register('categories', views.CategoryViewSet)
router.register('subcategories', views.SubcategoryViewSet)
router.register('parts', views.PartViewSet)
router.register('products', views.ProductViewSet)

urlpatterns = [
    *router.urls,
    path('cost-setting/', views.CostSettingView.as_view(), name='cost-setting'),
]
