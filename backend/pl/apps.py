from django.apps import AppConfig


class PlConfig(AppConfig):
    # 저장하는 것 없음 (모델 없음). 판매 · 지출 · 스풀을 달마다 더하기만 한다 (docs/PRD.md 3.12 PL)
    name = 'pl'
    verbose_name = '손익'
