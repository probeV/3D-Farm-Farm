from django.urls import path

from . import views

urlpatterns = [
    path('pl/', views.pl, name='pl'),
]
