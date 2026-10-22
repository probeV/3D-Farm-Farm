from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """DRF 오류 응답 공통 처리 (settings.REST_FRAMEWORK['EXCEPTION_HANDLER'])

    - 404: Django 의 영어 문구("No Spool matches the given query.") 대신 항상 `찾을 수 없습니다.`
    """
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    return exception_handler(exc, context)
