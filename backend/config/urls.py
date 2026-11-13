"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    # JSON API. 주소가 바뀌는 변경을 하면 v1 을 새로 만들고 v0 는 그대로 둔다
    path('api/v0/', include('filaments.urls')),
    path('api/v0/', include('stock.urls')),
    path('api/v0/', include('products.urls')),
    path('api/v0/', include('expenses.urls')),
    path('api/v0/', include('sales.urls')),
]

# 개발 중에는 업로드 파일을 Django 가 직접 제공 (DEBUG=True 일 때만 동작)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
