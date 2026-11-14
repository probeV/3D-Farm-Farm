from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

# /api/v0/ 의 API 목록 화면은 filaments 라우터가 맡으므로 여기는 SimpleRouter
router = SimpleRouter()
router.register('store/links', views.StoreLinkViewSet)

urlpatterns = [
    path('store/connection/', views.connection, name='store-connection'),
    path('store/orders/', views.orders, name='store-orders'),
    path('store/imports/', views.imports, name='store-imports'),
    *router.urls,
]
