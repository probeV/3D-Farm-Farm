"""손익 JSON API (/api/v0/pl/, docs/api.md "손익").

새로 저장하는 것 없음. 판매 · 지출 · 스풀을 **달마다** 더해서 준다.
현금 기준 · 손익 기준 계산, 연 · 전체 합계, 투자 회수는 화면이 이 달별 합계를 더해서 한다 (pages/pl/plCalc.ts)
"""

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from expenses.models import Expense, ExpenseCategory
from filaments.models import Spool
from sales.models import Sale, SaleItem
from stock.models import PartKind, StockHistory
from stock.services import START_NOTE


def month_key(value):
    """TruncMonth 결과(date · datetime) → "2026-10" """
    return value.strftime('%Y-%m')


def months_between(first, last):
    """2026-05 ~ 2026-10 사이의 달 문자열 (양 끝 포함)"""
    y, m = map(int, first.split('-'))
    out = []
    while f'{y:04d}-{m:02d}' <= last:
        out.append(f'{y:04d}-{m:02d}')
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def monthly_totals():
    """달마다 판매 · 지출(분류별) · 사용 시작한 스풀 합계. 기록이 있는 첫 달부터 이번 달까지 빈 달도 0 으로"""
    rows = {}

    def row(key):
        return rows.setdefault(key, {})

    # 판매: 판매가 합계는 제품 줄에서, 받은 배송비 · 수수료 · 건수는 주문에서
    for r in (
        SaleItem.objects.annotate(m=TruncMonth('sale__date'))
        .values('m')
        .annotate(gross=Sum(F('unit_price') * F('qty')))
        .order_by()
    ):
        row(month_key(r['m']))['gross'] = r['gross']
    for r in (
        Sale.objects.annotate(m=TruncMonth('date'))
        .values('m')
        .annotate(shipping=Sum('shipping_received'), fee=Sum('fee'), sales=Count('id'))
        .order_by()
    ):
        row(month_key(r['m'])).update(shipping=r['shipping'], fee=r['fee'], sales=r['sales'])

    # 스풀: 사용 시작일(이 PC 시간대 기준 달). 구매가가 없으면 색상 가격 → 필라멘트 가격
    tz = timezone.get_current_timezone()
    for r in (
        Spool.objects.filter(opened_at__isnull=False)
        .annotate(m=TruncMonth('opened_at', tzinfo=tz), p=Coalesce('price', 'color__price', 'color__filament__price'))
        .values('m')
        .annotate(spool=Sum('p'), spools=Count('id'), unpriced=Count('id') - Count('p'))
        .order_by()
    ):
        row(month_key(r['m'])).update(spool=r['spool'] or 0, spools=r['spools'], spools_unpriced=r['unpriced'])

    # 부속품 · 포장재 쓴 만큼 (손익 기준): 판매로 빠진 것 + 조정(처음 수량 빼고) × 그때 단가.
    # 조정으로 늘면 비용이 줄어든다
    used = StockHistory.objects.filter(
        Q(kind=StockHistory.Kind.SALE) | (Q(kind=StockHistory.Kind.ADJUST) & ~Q(note=START_NOTE)),
        part__kind__in=[PartKind.PART, PartKind.PACK],
    )
    for r in (
        used.annotate(m=TruncMonth('date'))
        .values('m')
        .annotate(cost=Sum(-F('qty') * F('unit_price')), unpriced=Count('id', filter=Q(unit_price__isnull=True)))
        .order_by()
    ):
        row(month_key(r['m'])).update(parts_used=r['cost'] or 0, parts_unpriced=r['unpriced'])

    # 지출: 분류별 (장비 · 필라멘트 · 부속품 · 포장재 포함 — 어느 기준에 넣을지는 화면이 고른다)
    for r in (
        Expense.objects.annotate(m=TruncMonth('date')).values('m', 'category').annotate(amount=Sum('amount')).order_by()
    ):
        row(month_key(r['m'])).setdefault('expenses', {})[r['category']] = r['amount']

    this_month = timezone.localdate().strftime('%Y-%m')
    keys = sorted(rows)
    first = keys[0] if keys else this_month
    last = max(keys[-1], this_month) if keys else this_month
    cats = [c.value for c in ExpenseCategory]
    out = []
    for key in months_between(first, last):
        r = rows.get(key, {})
        exp = r.get('expenses', {})
        out.append(
            {
                'month': key,
                'gross': int(r.get('gross') or 0),
                'shipping': int(r.get('shipping') or 0),
                'fee': int(r.get('fee') or 0),
                'sales': r.get('sales', 0),
                'spool': int(r.get('spool') or 0),
                'spools': r.get('spools', 0),
                'spools_unpriced': r.get('spools_unpriced', 0),
                'parts_used': round(r.get('parts_used') or 0),
                'parts_unpriced': r.get('parts_unpriced', 0),
                'expenses': {c: int(exp.get(c) or 0) for c in cats},
            }
        )
    return out


@api_view(['GET'])
def pl(request):
    """GET /pl/ → {months: [{month, gross, shipping, fee, sales, spool, spools, spools_unpriced,
    parts_used, parts_unpriced, expenses}]} (docs/api.md)"""
    return Response({'months': monthly_totals()})
