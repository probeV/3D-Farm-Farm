"""필라멘트 지출의 구매 항목 → 스풀 (v2 TBD-33). 지출 → 스풀 한 방향, 차이만.

지출 API(expenses — 저장 · 수정 · 삭제)에서 쓴다. expenses 를 import 하지 않고 구매 항목의
color_id · qty 와 넘겨받은 롤당 금액 · 지출 날짜만 읽는다 (스풀은 Spool.buy 로 그 항목을 가리킴).

- 롤 수를 늘리면 늘린 만큼 새 스풀 (상태 `재고`, 번호는 다음 번호부터)
- 줄이면 줄인 만큼 그 항목의 `재고` 스풀을 지움 (번호 큰 것부터). 모자라면 지출 쪽 검사에서 막음
- 색상 · 롤당 금액 · 날짜가 바뀌면 그 항목 스풀 전부에 반영 (색상은 전부 `재고` 일 때만 — 검사에서 막음)
- "차이만": 지금 스풀 수가 아니라 지출에서 바뀐 롤 수만큼 — 스풀에서 분실 · 불량으로 지운 것이 다시 생기지 않게
"""

from django.db import transaction
from django.db.models import Count, Q

from .models import Spool

SEALED = Spool.Status.SEALED


def counts(item_ids):
    """{항목 id: (재고 스풀 수, 사용한 스풀 수)} — 사용한 = 사용 중 + 사용 완료"""
    rows = (
        Spool.objects.filter(buy_id__in=item_ids)
        .values('buy_id')
        .annotate(sealed=Count('id', filter=Q(status=SEALED)), used=Count('id', filter=~Q(status=SEALED)))
    )
    return {row['buy_id']: (row['sealed'], row['used']) for row in rows}


@transaction.atomic
def sync_item(item, old_qty, price, date):
    """구매 항목 하나를 저장한 뒤: 그 항목 스풀의 색상 · 구매가 · 구매일을 맞추고, 롤 수 차이만큼 만들거나 지운다"""
    Spool.objects.filter(buy=item).update(color_id=item.color_id, price=price, purchased_at=date)
    diff = int(item.qty) - int(old_qty)
    if diff > 0:
        Spool.objects.bulk_create(
            Spool(color_id=item.color_id, code_no=n, status=SEALED, price=price, purchased_at=date, buy=item)
            for n in Spool.take_code_nos(diff)
        )
    elif diff < 0:
        drop(item, -diff)


def drop(item, count=None):
    """그 항목의 `재고` 스풀을 count 개(없으면 전부) 지운다 — 번호 큰 것부터"""
    sealed = Spool.objects.filter(buy=item, status=SEALED).order_by('-code_no')
    ids = sealed.values_list('id', flat=True)
    ids = list(ids if count is None else ids[:count])
    Spool.objects.filter(id__in=ids).delete()
