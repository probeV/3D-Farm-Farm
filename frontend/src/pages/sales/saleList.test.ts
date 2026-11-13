import { describe, expect, it } from 'vitest'
import type { CostSetting } from '../../api/products'
import type { Sale, SaleItem } from '../../api/sales'
import type { Cost } from '../products/cost'
import {
  autoFee,
  byProduct,
  filterSales,
  NO_FILTER,
  salesCsv,
  snapshotCost,
  summarize,
  type ListFilter,
} from './saleList'

const TODAY = '2026-10-28'
const SETTING: CostSetting = {
  power_kw: 0.36,
  elec_rate: 215,
  fee_order: 1.98,
  fee_sales: 2.73,
  shipping_cost: 0,
  target_margin: 40,
}

let nextId = 1
const item = (p: Partial<SaleItem>): SaleItem => {
  const i = {
    id: nextId++,
    product: 1,
    product_name: '분수 원판 세트',
    qty: 1,
    unit_price: 18900,
    unit_cost: 3227,
    ...p,
  }
  return { ...i, amount: i.qty * i.unit_price }
}
// 서버 계산값(gross · settle · cost · profit)도 같은 규칙으로 채움
const sale = (p: Partial<Sale> & { items?: SaleItem[] }): Sale => {
  const items = p.items ?? [item({})]
  const gross = items.reduce((a, i) => a + i.amount, 0)
  const base = { shipping_received: 0, fee: 0, shipping_cost: 0, ...p }
  const settle = gross + base.shipping_received - base.fee
  const cost = items.some((i) => i.unit_cost == null) ? null : items.reduce((a, i) => a + i.qty * (i.unit_cost ?? 0), 0)
  return {
    id: nextId++,
    date: '2026-10-01',
    channel: 'store',
    order_no: '',
    packs: [],
    pack_cost: 0,
    note: '',
    created_at: '',
    ...base,
    items,
    gross,
    settle,
    cost,
    profit: cost == null ? null : settle - cost - base.shipping_cost,
  }
}

describe('autoFee (SALE-03)', () => {
  it('스마트스토어는 (판매가 + 배송비) × 4.71%, 원 단위 반올림 — 서버 Sale.store_fee 와 같음', () => {
    expect(autoFee('store', 42700, 0, SETTING)).toBe(2011)
    expect(autoFee('store', 24000, 3000, SETTING)).toBe(1272)
  })
  it('직접 판매 · 기타는 0', () => {
    expect(autoFee('direct', 42700, 0, SETTING)).toBe(0)
    expect(autoFee('etc', 42700, 3000, SETTING)).toBe(0)
  })
})

describe('snapshotCost (SALE-05)', () => {
  const cost = (c: number, warnings: string[], pack = 0, packWarnings: string[] = []) =>
    ({ cost: c, warnings: [...warnings, ...packWarnings], pack, packWarnings }) as unknown as Cost
  it('원가 계산표 값을 원 단위로', () => expect(snapshotCost(cost(3227.4, []))).toBe(3227))
  it('판매가 미입력은 원가와 상관없음', () => expect(snapshotCost(cost(1459.6, ['판매가 미입력']))).toBe(1460))
  it('가격 · 사용량 · 출력 시간이 덜 됐으면 원가 없음', () => {
    expect(snapshotCost(cost(600, ['Esun › PETG 가격 미입력']))).toBeNull()
    expect(snapshotCost(cost(0, ['출력 시간 미입력', '판매가 미입력']))).toBeNull()
  })
  it('포장은 빼고 복사 — 포장비 · 기본 포장 경고는 상관없음 (SALE-06)', () => {
    expect(snapshotCost(cost(3500, [], 300))).toBe(3200)
    expect(snapshotCost(cost(3200, [], 0, ['기본 포장 미입력']))).toBe(3200)
  })
})

describe('filterSales', () => {
  const a = sale({
    date: '2026-10-23',
    order_no: '2026102389012',
    items: [item({}), item({ product: 4, product_name: '이름 키링', unit_price: 4900 })],
  })
  const b = sale({
    date: '2026-09-12',
    channel: 'etc',
    note: '학원 단체 주문',
    items: [item({ qty: 5, unit_price: 17000 })],
  })
  const c = sale({
    date: '2026-10-11',
    channel: 'direct',
    items: [item({ product: null, product_name: '하노이 탑', unit_price: 4500 })],
  })
  const all = [b, c, a]
  const f = (p: Partial<ListFilter>) => filterSales(all, { ...NO_FILTER, ...p }, TODAY)

  it('기본은 최근 날짜순', () => expect(f({}).map((s) => s.id)).toEqual([a.id, c.id, b.id]))
  it('기간 · 판매처', () => {
    expect(f({ period: 'month' }).map((s) => s.id)).toEqual([a.id, c.id])
    expect(f({ channel: 'etc' }).map((s) => s.id)).toEqual([b.id])
  })
  it('제품: 그 제품이 든 주문만. 지운 제품은 이름으로', () => {
    expect(f({ product: 'p4' }).map((s) => s.id)).toEqual([a.id])
    expect(f({ product: 'n하노이 탑' }).map((s) => s.id)).toEqual([c.id])
  })
  it('검색: 제품명 · 주문번호 · 메모', () => {
    expect(f({ q: '키링' }).map((s) => s.id)).toEqual([a.id])
    expect(f({ q: '89012' }).map((s) => s.id)).toEqual([a.id])
    expect(f({ q: '단체' }).map((s) => s.id)).toEqual([b.id])
  })
  it('이익 정렬: 원가 없는 주문은 맨 뒤', () => {
    const noCost = sale({ date: '2026-10-27', items: [item({ unit_cost: null })] })
    const rows = filterSales([...all, noCost], { ...NO_FILTER, sort: { key: 'profit', dir: 'desc' } }, TODAY)
    expect(rows[rows.length - 1].id).toBe(noCost.id)
  })
})

describe('summarize · byProduct', () => {
  const oct = sale({
    date: '2026-10-23',
    fee: 2011,
    shipping_cost: 3300,
    items: [item({ qty: 2 }), item({ product: 4, product_name: '이름 키링', unit_price: 4900, unit_cost: 191 })],
  })
  const octNoCost = sale({ date: '2026-10-06', items: [item({ unit_cost: null })] })
  const sep = sale({ date: '2026-09-12', items: [item({ qty: 5, unit_price: 17000 })] })

  it('이번 달 카드 · 누적', () => {
    const s = summarize([oct, octNoCost, sep], TODAY)
    expect(s.monthGross).toBe(42700 + 18900)
    expect(s.monthCount).toBe(2)
    expect(s.monthQty).toBe(4)
    expect(s.monthFee).toBe(2011)
    // 원가 없는 주문은 이익에서 빠짐: 40,689 − 6,645 − 3,300
    expect(s.monthProfit).toBe(30744)
    expect(s.monthNoCost).toBe(true)
    expect(s.total).toBe(42700 + 18900 + 85000)
    expect(s.since).toBe('2026-09-12')
  })

  it('제품별 판매: 판매가 합계 큰 순', () => {
    const rows = byProduct([oct, sep])
    expect(rows.map((r) => [r.name, r.qty, r.amount])).toEqual([
      ['분수 원판 세트', 7, 37800 + 85000],
      ['이름 키링', 1, 4900],
    ])
  })
})

describe('salesCsv', () => {
  it('제품은 한 칸에 "이름 × 수량 · …", 원가 없으면 빈칸', () => {
    const csv = salesCsv([
      sale({ date: '2026-10-06', items: [item({ qty: 2, unit_cost: null }), item({ product_name: '이름 키링' })] }),
    ])
    const line = csv.split(/\r?\n/)[1]
    expect(line).toContain('분수 원판 세트 × 2 · 이름 키링 × 1')
    expect(line).toContain('스마트스토어')
  })
})
