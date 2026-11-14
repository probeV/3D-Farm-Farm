"""남은 수량 바꾸기 (STOCK-04 · 05). 남은 수량(Part.stock)과 입출고 기록(StockHistory)을 항상 함께 바꾼다.

여러 API 에서 쓴다 — 품목 조정 · 다 씀(stock), 판매 저장 · 삭제(sales), 지출 구매 항목 저장 · 삭제(expenses, TBD-31).
sales · products · expenses 를 import 하지 않고, 판매의 줄(sale.items · sale.packs) · 지출의 구매 항목(expense.items) ·
제품의 부속품(product.parts)을 역참조로 읽는다.
"""

from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum

from .models import Part, StockHistory

# 처음 등록할 때 지금 수량을 넣은 조정 기록의 설명. 손익의 `쓴 만큼` 에서 뺀다 (쓴 것이 아니라 있던 것)
START_NOTE = '처음 수량'

# move() 의 price 기본값: 품목의 지금 단가 (평균, 없으면 직접 넣은 구매가)
NOW = object()

Q4 = Decimal('0.0001')


def q4(value):
    return None if value is None else Decimal(value).quantize(Q4)


def mix(stock, avg, qty, price):
    """이동평균: 남은 수량(0 아래면 0으로) × 평균 + 들어온 수량 × 단가 → 새 평균"""
    base = max(stock, Decimal(0))
    if avg is None or base == 0:
        return Decimal(price)
    return (base * avg + qty * Decimal(price)) / (base + qty)


def recalc(part):
    """평균 단가(이동평균) 다시 계산 — 지출 구매 항목 · 입출고 기록을 날짜순(같은 날이면 넣은 순)으로 처음부터 따라간다.

    - 들어옴: 지출 구매 항목(지출 날짜, 항목 단가) · 처음 수량(등록할 때 구매가. 지출로 산 적이 없으면 지금 구매가)
      → 평균 = (남은 수량 × 평균 + 들어온 수량 × 단가) ÷ (남은 + 들어온 수량)
    - 나감 · 그 밖(판매 · 조정 · 다 씀): 평균은 그대로, 그 기록의 단가 = 그때 평균 (손익의 `쓴 만큼`).
      평균을 아직 모르면 저장된 단가 그대로 (구매가만 직접 넣은 품목)
    지출을 고치거나 지우거나 지난 날짜로 넣어도 맞게 늘 처음부터 다시 한다.
    입출고 기록의 지출 줄은 쓰지 않는다 (구매 항목으로)"""
    buys = list(part.buy_items.select_related('expense'))
    rows = list(part.history.exclude(kind=StockHistory.Kind.BUY))
    events = [(b.expense.date, b.expense.created_at, b, None) for b in buys if b.qty > 0]
    events += [(h.date, h.created_at, None, h) for h in rows]
    events.sort(key=lambda e: (e[0], e[1]))
    stock, avg, changed = Decimal(0), None, []
    for _, _, buy, row in events:
        if buy is not None:
            avg = mix(stock, avg, buy.qty, buy.total / buy.qty)
            stock += buy.qty
            continue
        if row.kind == StockHistory.Kind.ADJUST and row.note == START_NOTE:
            price = q4(row.unit_price if buys else part.base_price)
            if row.qty > 0 and price is not None:
                avg = mix(stock, avg, row.qty, price)
        else:
            price = q4(avg) if avg is not None else row.unit_price
        if row.unit_price != price:
            row.unit_price = price
            changed.append(row)
        stock += row.qty
    StockHistory.objects.bulk_update(changed, ['unit_price'])
    part.avg_price = q4(avg)
    Part.objects.filter(pk=part.pk).update(avg_price=part.avg_price)


def recalc_parts(ids):
    """품목 여러 개의 평균 단가 다시 계산 (지출 · 판매를 저장 · 삭제한 뒤)"""
    for part in Part.objects.filter(pk__in=list(ids)):
        recalc(part)


@transaction.atomic
def move(part, kind, qty, note='', sale=None, expense=None, date=None, price=NOW):
    """남은 수량에 qty 를 더하고(빼면 −) 기록을 남긴다 → 만든 StockHistory. qty 가 0 이면 아무것도 안 함(None).
    단가는 기본으로 품목의 지금 단가를 함께 저장하고(처음 수량은 등록할 때 구매가), 평균 단가를 다시 계산한다
    (판매를 줄이거나 지워 되돌릴 때는 빠질 때 단가를 넘김)"""
    qty = Decimal(qty)
    if not qty:
        return None
    Part.objects.filter(pk=part.pk).update(stock=F('stock') + qty)
    part.refresh_from_db(fields=['stock', 'avg_price'])
    extra = {'date': date} if date else {}
    if price is NOW:
        price = part.base_price if note == START_NOTE and kind == StockHistory.Kind.ADJUST else part.unit_price
    row = StockHistory.objects.create(
        part=part,
        kind=kind,
        qty=qty,
        after=part.stock,
        note=note,
        sale=sale,
        expense=expense,
        unit_price=q4(price),
        **extra,
    )
    recalc(part)
    return row


def adjust(part, mode, qty, note=''):
    """조정 창 (STOCK-04): `set` 실제 수량으로 맞추기 · `sub` 빼기 · `add` 더하기"""
    qty = Decimal(qty)
    change = {'set': qty - part.stock, 'sub': -qty, 'add': qty}[mode]
    return move(part, StockHistory.Kind.ADJUST, change, note)


def sale_usage(sale):
    """이 판매로 빠져야 할 수량 {품목 id: 수량} — 판매의 부속품 줄과 포장 줄 그대로
    (부속품 줄은 처음에 제품의 사용 부속품 × 수량으로 채우고 판매마다 고칠 수 있음)"""
    usage = defaultdict(Decimal)
    for line in sale.parts.all():
        if line.part_id:
            usage[line.part_id] += line.qty
    for pack in sale.packs.all():
        if pack.part_id:
            usage[pack.part_id] += pack.qty
    return usage


def recorded(**source):
    """이 판매(sale=) · 지출(expense=)로 이미 기록된 수량 합계 {품목 id: 수량(빠졌으면 −)}"""
    rows = StockHistory.objects.filter(**source).values('part_id').annotate(total=Sum('qty'))
    return {row['part_id']: row['total'] for row in rows}


def recorded_price(**source):
    """이 판매로 빠질 때 저장한 단가 {품목 id: 평균 단가}. 판매를 줄이거나 지워 되돌릴 때 같은 단가로 돌려놓는다
    (손익의 `쓴 만큼` 이 0 으로 맞게). 단가가 없는 기록뿐이면 None"""
    out = {}
    rows = StockHistory.objects.filter(**source, unit_price__isnull=False).values('part_id')
    for row in rows.annotate(total=Sum('qty'), amount=Sum(F('qty') * F('unit_price'))):
        out[row['part_id']] = q4(row['amount'] / row['total']) if row['total'] else None
    return out


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
    # 판매 날짜를 바꿨으면 이 판매의 기록도 그 날짜로 (손익의 `쓴 만큼` 이 판매한 달에 들어가게)
    StockHistory.objects.filter(sale=sale).exclude(date=sale.date).update(date=sale.date)
    done = recorded(sale=sale)
    prices = recorded_price(sale=sale)
    want = {pid: -qty for pid, qty in sale_usage(sale).items()}
    note = sale_note(sale)
    parts = Part.objects.in_bulk(set(done) | set(want))
    for pid, part in parts.items():
        diff = want.get(pid, 0) - done.get(pid, 0)
        # 더 빠지면 지금 단가, 덜 빠지면(되돌림) 빠질 때 단가
        price = prices.get(pid) if diff > 0 and pid in prices else NOW
        move(part, StockHistory.Kind.SALE, diff, note, sale=sale, date=sale.date, price=price)
    # 날짜만 바꾼 판매도 그 뒤 평균 · 단가가 달라질 수 있어 다시
    recalc_parts(parts)


@transaction.atomic
def revert_sale(sale):
    """판매를 지우기 전에 부르면, 이 판매로 빠진 수량을 되돌리는 기록을 남긴다"""
    done = recorded(sale=sale)
    prices = recorded_price(sale=sale)
    note = sale_note(sale, '판매 삭제')
    # 되돌리는 기록은 판매 날짜 · 빠질 때 단가로 — 그 달 손익의 `쓴 만큼` 이 0 이 되게
    for pid, part in Part.objects.in_bulk(list(done)).items():
        move(part, StockHistory.Kind.SALE, -done[pid], note, date=sale.date, price=prices.get(pid, NOW))


def expense_note(expense, prefix='지출'):
    """기록 설명: `지출 · 네오디뮴 자석 200개`"""
    return f'{prefix} · {expense.name}'[:200]


@transaction.atomic
def sync_expense(expense):
    """지출을 저장한 뒤 부르면, 구매 줄의 품목 수량만큼 남은 수량을 늘린다 (판매와 같게 — 고치면 차이만)"""
    done = recorded(expense=expense)
    want = defaultdict(Decimal)
    for line in expense.items.all():
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
