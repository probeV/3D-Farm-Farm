import { describe, expect, it } from 'vitest'
import type { StoreLine, StoreOrder } from '../../../api/store'
import { countKinds, importBody, initialChecked, relink, settleGap, statusClass } from './storeOrders'

const line = (p: Partial<StoreLine> = {}): StoreLine => ({
  store_item_id: '2026111094085851',
  store_product_id: '13860694961',
  store_name: '[한층공방] ABC 키캡 클리커 키링 1구',
  option: '글자: A / 스위치: 청축',
  qty: 150,
  amount: 450000,
  status: 'PAYED',
  status_label: '결제완료',
  alive: true,
  link: 1,
  product: null,
  product_name: null,
  ...p,
})

const order = (p: Partial<StoreOrder> = {}): StoreOrder => ({
  order_id: '2026111074714211',
  date: '2026-11-10',
  kind: 'need',
  manual: false,
  sale: null,
  status: 'PAYED',
  status_label: '결제완료',
  changes: [],
  gross: 450000,
  shipping: 0,
  fee: 29835,
  settle: 420165,
  naver_settle: 420165,
  lines: [line()],
  ...p,
})

describe('스마트스토어 미리보기', () => {
  it('바로 연결하면 그 연결을 쓰는 새 주문은 need → ok', () => {
    const orders = [
      order(),
      order({ order_id: 'B', lines: [line({ store_item_id: 'b1' }), line({ store_item_id: 'b2', link: 2 })] }),
      order({ order_id: 'C', kind: 'dup', lines: [line({ store_item_id: 'c1' })] }),
    ]
    const next = relink(orders, 1, { id: 5, name: 'ABC 1구 클리커' })
    expect(next.map((o) => o.kind)).toEqual(['ok', 'need', 'dup'])
    expect(next[0].lines[0].product_name).toBe('ABC 1구 클리커')
    expect(relink(next, 1, null)[0].kind).toBe('need')
  })

  it('취소된 줄은 연결 안 돼도 됨', () => {
    const o = order({ lines: [line(), line({ store_item_id: 'x', link: 9, alive: false })] })
    expect(relink([o], 1, { id: 5, name: 'a' })[0].kind).toBe('ok')
  })

  it('처음엔 넣기 · 맞추기 · 지우기만 고름, 본문은 그 상품주문번호 · 원가', () => {
    const orders = [
      order({ kind: 'ok', lines: [line({ product: 5 })] }),
      order({ order_id: 'S', kind: 'sync', lines: [line({ store_item_id: 's1', product: 5 })] }),
      order({ order_id: 'D', kind: 'dup', lines: [line({ store_item_id: 'd1', product: 6 })] }),
    ]
    const checked = initialChecked(orders)
    expect([...checked]).toEqual(['2026111074714211', 'S'])
    const body = importBody(orders, checked, { from: '2026-11-01', to: '2026-11-14' }, (p) => (p === 5 ? 1200 : null))
    expect(body).toEqual({
      date_from: '2026-11-01',
      date_to: '2026-11-14',
      product_order_ids: ['2026111094085851', 's1'],
      costs: { '5': 1200 },
      total: 3,
    })
  })

  it('요약 · 정산 차이 · 상태 색', () => {
    expect(countKinds([order(), order({ kind: 'ok' }), order({ kind: 'ok' })])).toEqual({ need: 1, ok: 2 })
    expect(settleGap(order())).toBe(0)
    expect(settleGap(order({ naver_settle: 400000 }))).toBe(20165)
    expect([statusClass('PURCHASE_DECIDED'), statusClass('RETURNED'), statusClass('PAYED')]).toEqual([
      'good',
      'bad',
      'info',
    ])
  })
})
