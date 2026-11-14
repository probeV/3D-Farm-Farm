// 스마트스토어 미리보기 계산 (화면 쪽). 할 일(kind)은 서버가 정하고, 여기서는 고르기 · 바로 연결 · 넣기 본문만
import type { ImportInput, OrderKind, StoreOrder } from '../../../api/store'

// 넣기를 누르면 처리되는 주문: 새로 넣기(ok) · 맞추기(sync) · 지우기(gone). 나머지는 체크할 수 없음
export const ACTIONABLE: OrderKind[] = ['ok', 'sync', 'gone']
export const actionable = (o: StoreOrder) => ACTIONABLE.includes(o.kind)

// 표에서 흐리게 (넣지 않는 주문)
export const dimmed = (o: StoreOrder) => o.kind === 'dup' || o.kind === 'cancel' || o.kind === 'wait'

// 할 일 배지: [글, 색]
export const KIND_BADGE: Record<OrderKind, [string, string] | null> = {
  ok: null,
  need: ['상품 연결 필요', 'warn'],
  cancel: ['취소 · 반품', ''],
  wait: ['결제 전', ''],
  dup: ['이미 있음', ''],
  sync: ['맞춤', 'info'],
  gone: ['판매 삭제', 'bad'],
}

// 스마트스토어 상태 배지 색
export function statusClass(status: string) {
  if (status === 'PURCHASE_DECIDED') return 'good'
  if (['CANCELED', 'RETURNED', 'CANCELED_BY_NOPAYMENT'].includes(status)) return 'bad'
  if (['PAYED', 'DELIVERING', 'DELIVERED', 'EXCHANGED'].includes(status)) return 'info'
  return ''
}

// 이 앱의 정산 금액이 네이버 예정 금액과 다르면 그 차이 (같으면 0)
export const settleGap = (o: StoreOrder) => o.settle - o.naver_settle

// 미리보기에서 바로 연결 (기본 연결 줄에 제품을 고름): 그 연결 줄을 쓰는 줄의 제품을 바꾸고,
// 새 주문이면 할 일을 다시 (살아 있는 줄이 모두 연결되면 need → ok)
export function relink(orders: StoreOrder[], link: number, product: { id: number; name: string } | null) {
  return orders.map((o) => {
    if (!o.lines.some((l) => l.link === link)) return o
    const lines = o.lines.map((l) =>
      l.link === link ? { ...l, product: product?.id ?? null, product_name: product?.name ?? null } : l,
    )
    const fresh = o.kind === 'ok' || o.kind === 'need'
    const linked = lines.filter((l) => l.alive).every((l) => l.product != null)
    return { ...o, lines, kind: fresh ? (linked ? 'ok' : 'need') : o.kind }
  })
}

// 처음 고를 주문: 넣기로 처리되는 것 전부
export const initialChecked = (orders: StoreOrder[]) => new Set(orders.filter(actionable).map((o) => o.order_id))

// 고른 주문 → 넣기 본문. 원가는 판매 창과 같은 값(포장 빼고, 입력이 덜 됐으면 null)
export function importBody(
  orders: StoreOrder[],
  checked: Set<string>,
  range: { from: string; to: string },
  costOf: (product: number) => number | null,
): ImportInput {
  const picked = orders.filter((o) => checked.has(o.order_id) && actionable(o))
  const products = new Set(picked.flatMap((o) => o.lines.map((l) => l.product)).filter((p): p is number => p != null))
  return {
    date_from: range.from,
    date_to: range.to,
    product_order_ids: picked.flatMap((o) => o.lines.map((l) => l.store_item_id)),
    costs: Object.fromEntries([...products].map((p) => [String(p), costOf(p)])),
    total: orders.length,
  }
}

// 요약 줄 개수 { ok: 2, need: 1, … }
export function countKinds(orders: StoreOrder[]) {
  const out: Partial<Record<OrderKind, number>> = {}
  for (const o of orders) out[o.kind] = (out[o.kind] ?? 0) + 1
  return out
}
