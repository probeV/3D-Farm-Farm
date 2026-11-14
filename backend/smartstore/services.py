"""스마트스토어 주문 → 판매 장부 (v2 STORE-02 · 03 · 05).

1. 미리보기 preview(기간): 그 기간에 바뀐 상품 주문(결제 · 배송 · 취소 · 반품 · 구매확정 …)을 가져와 주문번호로 묶고,
   주문마다 할 일(kind)을 정한다. 처음 보는 스토어 상품은 `연결 안 함` 연결 줄을 만든다
2. 넣기 apply(골라 보낸 주문): 상세를 다시 가져와 같은 규칙으로 판매를 만들거나(ok) 맞추고(sync · gone), 기록을 남긴다

판매에 넣는 값 (결제 완료부터 — 정산 전이면 네이버가 알려 준 예정 금액):
  날짜 = 결제일 · 판매처 = 스마트스토어 · 주문번호 = orderId · 줄마다 상품주문번호 = productOrderId
  수량 = remainQuantity · 판매가 = remainPaymentAmount (취소 · 반품을 뺀 남은 결제 금액, 단가는 ÷ 수량 원 단위)
  받은 배송비 = Σ deliveryFeeAmount · 수수료 = Σ (paymentCommission + saleCommission
                + knowledgeShoppingSellingInterlockCommission + channelCommission)
  네이버 정산 예정 금액(Σ expectedSettlementAmount)과 이 앱의 정산 금액(판매가 + 배송비 − 수수료)이
  다르면 미리보기에 알림
"""

import datetime as dt
from collections import OrderedDict
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from products.models import CostSetting
from sales.models import Sale, SaleChannel, SaleItem, SalePack, won
from stock import services as stock

from . import naver
from .models import StoreImport, StoreLink

# 상품 주문 상태 (네이버 productOrderStatus)
GONE = {'CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT'}  # 판매가 아님 (전부 취소 · 반품)
WAITING = {'PAYMENT_WAITING'}  # 아직 결제 전 — 넣지 않음
STATUS_LABEL = {
    'PAYMENT_WAITING': '결제대기',
    'PAYED': '결제완료',
    'DELIVERING': '배송중',
    'DELIVERED': '배송완료',
    'PURCHASE_DECIDED': '구매확정',
    'EXCHANGED': '교환',
    'CANCELED': '취소',
    'RETURNED': '반품',
    'CANCELED_BY_NOPAYMENT': '미결제 취소',
}
COMMISSIONS = (
    'paymentCommission',
    'saleCommission',
    'knowledgeShoppingSellingInterlockCommission',
    'channelCommission',
)
MAX_DAYS = 31  # 미리보기 한 번에 볼 수 있는 기간 (하루씩 묻기 때문에)


def _num(value):
    return Decimal(str(value or 0))


def _date(value):
    """'2026-11-10T19:06:40.311+09:00' → 2026-11-10 (한국 시간)"""
    return dt.datetime.fromisoformat(value).astimezone(naver.KST).date() if value else None


def normalize(detail):
    """상품 주문 상세 한 건 → 이 앱에서 쓰는 값만"""
    order, po = detail.get('order') or {}, detail.get('productOrder') or {}
    status = po.get('productOrderStatus', '')
    qty = po.get('remainQuantity', po.get('quantity', 0)) or 0
    return {
        'store_item_id': str(po.get('productOrderId', '')),
        'order_id': str(order.get('orderId', '')),
        'date': _date(order.get('paymentDate') or order.get('orderDate')),
        'status': status,
        'store_product_id': str(po.get('productId', '')),
        'store_name': po.get('productName', ''),
        'option': po.get('productOption') or '',
        'qty': int(qty),
        'amount': _num(po.get('remainPaymentAmount', po.get('totalPaymentAmount'))),
        'shipping': _num(po.get('deliveryFeeAmount')),
        'fee': sum((_num(po.get(k)) for k in COMMISSIONS), Decimal(0)),
        'settle': _num(po.get('expectedSettlementAmount')),
        'alive': status not in GONE | WAITING and qty > 0,
    }


def group(details):
    """상품 주문들 → 주문번호별 {order_id, date, lines} (결제일 순)"""
    orders = OrderedDict()
    for line in map(normalize, details):
        o = orders.setdefault(line['order_id'], {'order_id': line['order_id'], 'date': line['date'], 'lines': []})
        o['lines'].append(line)
    return sorted(orders.values(), key=lambda o: (o['date'] or dt.date.min, o['order_id']))


def ensure_links(lines):
    """처음 보는 스토어 상품은 기본 연결 줄(제품 없음)을 만든다 → 연결 목록 전부 (제품까지 미리 읽음)"""
    known = set(StoreLink.objects.filter(option='').values_list('store_product_id', flat=True))
    new = {}
    for line in lines:
        if line['store_product_id'] and line['store_product_id'] not in known:
            new.setdefault(line['store_product_id'], line['store_name'][:200])
    StoreLink.objects.bulk_create(StoreLink(store_product_id=k, store_name=v) for k, v in new.items())
    return list(StoreLink.objects.select_related('product'))


def classify(order, links, items_by_id, sales_by_no):
    """주문 하나의 할 일 → order 에 kind · link · 합계 · 바뀐 것(changes) · sale 을 채운다

    kind: ok 넣을 수 있음 · need 상품 연결 필요 · cancel 취소 · 반품 (넣지 않음) · wait 결제 전 ·
          dup 이미 있음(그대로) · sync 이미 있음 — 수량 · 금액이 바뀜(맞춤) ·
          gone 이미 있음 — 전부 취소 · 반품(판매 삭제)
    """
    alive = [x for x in order['lines'] if x['alive']]
    for line in order['lines']:
        link = StoreLink.resolve(line['store_product_id'], line['option'], links)
        line['link'] = link
        line['product'] = link.product if link else None
    order['gross'] = sum((x['amount'] for x in alive), Decimal(0))
    order['shipping'] = sum((x['shipping'] for x in alive), Decimal(0))
    order['fee'] = sum((x['fee'] for x in alive), Decimal(0))
    order['settle'] = order['gross'] + order['shipping'] - order['fee']
    order['naver_settle'] = sum((x['settle'] for x in alive), Decimal(0))
    order['changes'] = []
    sale = next(
        (items_by_id[x['store_item_id']].sale for x in order['lines'] if x['store_item_id'] in items_by_id), None
    )
    manual = sale is None and sales_by_no.get(order['order_id'])
    order['sale'] = sale or manual or None
    order['manual'] = bool(manual)
    if manual:  # 주문번호만 같은 직접 넣은 판매 — 줄을 모르니 맞추지 않음
        order['kind'] = 'dup'
    elif sale:
        order['kind'] = 'gone' if not alive else _changes(order, sale, items_by_id)
    elif all(x['status'] in WAITING for x in order['lines']):
        order['kind'] = 'wait'
    elif not alive:
        order['kind'] = 'cancel'
    else:
        order['kind'] = 'need' if any(x['product'] is None for x in alive) else 'ok'
    return order


def _changes(order, sale, items_by_id):
    """이미 넣은 판매와 비교 → 'sync'(바뀐 것 있음) 또는 'dup'. 바뀐 것은 order['changes'] 에 짧은 글로"""
    ch = order['changes']
    for line in order['lines']:
        item = items_by_id.get(line['store_item_id'])
        if item is None:
            continue
        if not line['alive']:
            ch.append(f'{item.product_name} 취소 · 반품')
        elif item.qty != line['qty'] or item.amount != _unit(line) * line['qty']:
            ch.append(f'{item.product_name} {item.qty}개 → {line["qty"]}개')
    if sale.shipping_received != order['shipping']:
        ch.append(f'배송비 {sale.shipping_received:,.0f} → {order["shipping"]:,.0f}')
    if sale.fee != order['fee']:
        ch.append(f'수수료 {sale.fee:,.0f} → {order["fee"]:,.0f}')
    return 'sync' if ch else 'dup'


def _unit(line):
    return won(line['amount'] / line['qty']) if line['qty'] else Decimal(0)


def _context(orders):
    """이미 판매 장부에 있는 줄 · 주문번호 (한 번에 읽기)"""
    ids = [x['store_item_id'] for o in orders for x in o['lines']]
    items = SaleItem.objects.select_related('sale').filter(store_item_id__in=ids)
    nos = [o['order_id'] for o in orders]
    sales = {s.order_no: s for s in Sale.objects.filter(order_no__in=nos)}
    return {i.store_item_id: i for i in items}, sales


def _orders(details):
    orders = group(details)
    links = ensure_links([x for o in orders for x in o['lines']])
    items_by_id, sales_by_no = _context(orders)
    for o in orders:
        classify(o, links, items_by_id, sales_by_no)
    return orders


def preview(date_from, date_to):
    """기간 [date_from, date_to] (한국 날짜, 양 끝 포함 — 길이 검사는 RangeSerializer)에 바뀐 주문 → 주문 목록"""
    start = dt.datetime.combine(date_from, dt.time(), naver.KST)
    end = min(dt.datetime.combine(date_to + dt.timedelta(days=1), dt.time(), naver.KST), timezone.now())
    ids = naver.changed_product_orders(start, end) if start < end else []
    return _orders(naver.product_orders(ids)) if ids else []


# ---------------------------------------------------------------- 넣기 · 맞추기


def _packs_for(product):
    """제품의 기본 포장 세트 → 포장 줄 [(포장재, 수량)] (판매 창의 `첫 제품의 기본 포장` 과 같음)"""
    if not product or not product.default_pack_id:
        return []
    return [(line.part, line.qty) for line in product.default_pack.lines.select_related('part')]


def _create(order, costs, shipping_cost):
    alive = [x for x in order['lines'] if x['alive']]
    options = ', '.join(dict.fromkeys(x['option'] for x in alive if x['option']))
    sale = Sale.objects.create(
        date=order['date'],
        channel=SaleChannel.STORE,
        order_no=order['order_id'],
        shipping_received=order['shipping'],
        fee=order['fee'],
        shipping_cost=shipping_cost,
        note=options[:500],
    )
    for x in alive:
        SaleItem.objects.create(
            sale=sale,
            product=x['product'],
            qty=x['qty'],
            unit_price=_unit(x),
            unit_cost=costs.get(x['product'].pk),
            store_item_id=x['store_item_id'],
        )
    for part, qty in _packs_for(alive[0]['product']):
        price = part.unit_price
        SalePack.objects.create(sale=sale, part=part, qty=qty, unit_price=None if price is None else round(price, 2))
    stock.sync_sale(sale)
    return sale


def _sync(order, items_by_id):
    """이미 넣은 판매를 지금 값으로: 남은 수량 · 금액, 취소된 줄은 지움, 배송비 · 수수료. 전부 취소면 판매 삭제"""
    sale = order['sale']
    if order['kind'] == 'gone':
        stock.revert_sale(sale)
        sale.delete()
        return
    for line in order['lines']:
        item = items_by_id.get(line['store_item_id'])
        if item is None:
            continue
        if line['alive']:
            item.qty, item.unit_price = line['qty'], _unit(line)
            item.save(update_fields=['qty', 'unit_price'])
        else:
            item.delete()
    sale.shipping_received, sale.fee = order['shipping'], order['fee']
    sale.save(update_fields=['shipping_received', 'fee'])
    stock.sync_sale(sale)


@transaction.atomic
def apply(date_from, date_to, product_order_ids, costs, total):
    """골라 보낸 주문(상품주문번호들)을 다시 가져와 넣거나 맞춘다 → StoreImport.
    costs: {제품 id: 개당 원가(포장 빼고) 또는 None} — 화면의 원가 계산표 값 (판매 창과 같음)
    total: 미리보기에 보였던 주문 수 (뺀 건수 = total − 넣음 − 맞춤)"""
    details = naver.product_orders(list(dict.fromkeys(product_order_ids))) if product_order_ids else []
    orders = _orders(details)
    items_by_id, _ = _context(orders)
    shipping_cost = CostSetting.load().shipping_cost
    added = updated = 0
    for o in orders:
        if o['kind'] == 'ok':
            _create(o, costs, shipping_cost)
            added += 1
        elif o['kind'] in ('sync', 'gone'):
            _sync(o, items_by_id)
            updated += 1
    return StoreImport.objects.create(
        date_from=date_from,
        date_to=date_to,
        added=added,
        updated=updated,
        skipped=max(0, total - added - updated),
    )
