"""남은 수량 바꾸기 (STOCK-04 · 05). 남은 수량(Part.stock)과 입출고 기록(StockHistory)을 항상 함께 바꾼다.

여러 API 에서 쓴다 — 품목 조정 · 다 씀(stock), 판매 저장 · 삭제(sales), 지출 구매 줄 저장 · 삭제(expenses, TBD-31).
sales · products · expenses 를 import 하지 않고, 판매의 줄(sale.items · sale.packs) · 지출의 구매 줄(expense.lines) ·
제품의 부속품(product.parts)을 역참조로 읽는다.
"""

from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum

from .models import Part, StockHistory


@transaction.atomic
def move(part, kind, qty, note='', sale=None, expense=None, date=None):
    """남은 수량에 qty 를 더하고(빼면 −) 기록을 남긴다 → 만든 StockHistory. qty 가 0 이면 아무것도 안 함(None)"""
    qty = Decimal(qty)
    if not qty:
        return None
    Part.objects.filter(pk=part.pk).update(stock=F('stock') + qty)
    part.refresh_from_db(fields=['stock'])
    extra = {'date': date} if date else {}
    return StockHistory.objects.create(
        part=part, kind=kind, qty=qty, after=part.stock, note=note, sale=sale, expense=expense, **extra
    )


def adjust(part, mode, qty, note=''):
    """조정 창 (STOCK-04): `set` 실제 수량으로 맞추기 · `sub` 빼기 · `add` 더하기"""
    qty = Decimal(qty)
    change = {'set': qty - part.stock, 'sub': -qty, 'add': qty}[mode]
    return move(part, StockHistory.Kind.ADJUST, change, note)


def sale_usage(sale):
    """이 판매로 빠져야 할 수량 {품목 id: 수량} — 부속품은 제품의 사용 부속품 × 판매 수량, 포장재는 주문의 포장 줄"""
    usage = defaultdict(Decimal)
    for item in sale.items.select_related('product').prefetch_related('product__parts'):
        if item.product:
            for row in item.product.parts.all():
                usage[row.part_id] += row.qty * item.qty
    for pack in sale.packs.all():
        if pack.part_id:
            usage[pack.part_id] += pack.qty
    return usage


def recorded(**source):
    """이 판매(sale=) · 지출(expense=)로 이미 기록된 수량 합계 {품목 id: 수량(빠졌으면 −)}"""
    rows = StockHistory.objects.filter(**source).values('part_id').annotate(total=Sum('qty'))
    return {row['part_id']: row['total'] for row in rows}


def sale_note(sale, prefix='판매'):
    """기록 설명: `판매 · 이름 키링 외 1`"""
    names = [i.product_name for i in sale.items.all()]
    if not names:
        return prefix
    more = f' 외 {len(names) - 1}' if len(names) > 1 else ''
    return f'{prefix} · {names[0]}{more}'[:200]


@transaction.atomic
def sync_sale(sale):
    """판매를 저장한 뒤 부르면, 이미 이 판매로 빠진 수량과 비교해 차이만 기록한다 (새 판매는 전부, 고치면 차이만)"""
    done = recorded(sale=sale)
    want = {pid: -qty for pid, qty in sale_usage(sale).items()}
    note = sale_note(sale)
    parts = Part.objects.in_bulk(set(done) | set(want))
    for pid, part in parts.items():
        move(part, StockHistory.Kind.SALE, want.get(pid, 0) - done.get(pid, 0), note, sale=sale, date=sale.date)


@transaction.atomic
def revert_sale(sale):
    """판매를 지우기 전에 부르면, 이 판매로 빠진 수량을 되돌리는 기록을 남긴다"""
    done = recorded(sale=sale)
    note = sale_note(sale, '판매 삭제')
    for pid, part in Part.objects.in_bulk(list(done)).items():
        move(part, StockHistory.Kind.SALE, -done[pid], note)


def expense_note(expense, prefix='지출'):
    """기록 설명: `지출 · 네오디뮴 자석 200개`"""
    return f'{prefix} · {expense.name}'[:200]


@transaction.atomic
def sync_expense(expense):
    """지출을 저장한 뒤 부르면, 구매 줄의 품목 수량만큼 남은 수량을 늘린다 (판매와 같게 — 고치면 차이만)"""
    done = recorded(expense=expense)
    want = defaultdict(Decimal)
    for line in expense.lines.all():
        if line.part_id:
            want[line.part_id] += line.qty
    note = expense_note(expense)
    for pid, part in Part.objects.in_bulk(set(done) | set(want)).items():
        move(part, StockHistory.Kind.BUY, want.get(pid, 0) - done.get(pid, 0), note, expense=expense, date=expense.date)


@transaction.atomic
def revert_expense(expense):
    """지출을 지우기 전에 부르면, 이 지출로 늘어난 수량을 되돌리는 기록을 남긴다"""
    done = recorded(expense=expense)
    note = expense_note(expense, '지출 삭제')
    for pid, part in Part.objects.in_bulk(list(done)).items():
        move(part, StockHistory.Kind.BUY, -done[pid], note)
