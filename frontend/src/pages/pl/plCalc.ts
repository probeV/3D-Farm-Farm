// 손익 계산 (docs/PRD.md 3.12 PL). 서버가 준 달별 합계(PlMonth)를 기간만큼 더해서 두 기준으로 나눈다
import type { ExpenseCategory } from '../../api/expenses'
import type { PlMonth } from '../../api/pl'

export type Basis = 'pl' | 'cash' // 손익 기준 (쓴 만큼) / 현금 기준 (통장)

export type Period = { kind: 'month'; m: string } | { kind: 'year'; y: string } | { kind: 'all' }

export interface PlResult {
  // 판매
  gross: number // 판매가 합계
  shipping: number // 받은 배송비
  fee: number // 판매 수수료
  settle: number // 정산 금액 = 판매가 + 받은 배송비 − 수수료
  sales: number // 판매 건수
  // 손익 기준
  revenue: number // 매출 = 판매가 + 받은 배송비
  spool: number // 사용 시작한 스풀 구매가
  spools: number
  unpriced: number // 가격을 알 수 없는 스풀 수
  partUsed: number // 부속품 · 포장재 쓴 만큼 (판매 + 조정, 그때 단가)
  partUnpriced: number // 그중 단가가 없던 기록 수
  partBuy: number // 부속품 · 포장재 산 돈 (지출) — 손익에서는 쓴 만큼으로
  material: number // 재료비 = 스풀 + 부속품 · 포장재
  grossProfit: number // 매출총이익
  ops: { fee: number; sell: number; sub: number; supply: number; etc: number } // 운영비 (장비 제외)
  opsSum: number
  operating: number // 영업이익
  tax: number // 세금 (PL-06)
  net: number // 순이익
  // 현금 기준
  outAll: number // 나간 돈 = 지출 전부 (장비 · 필라멘트 포함)
  cash: number // 남은 돈 = 정산 금액 − 나간 돈
  // 두 기준 차이 (PL-05)
  invest: number // 장비 지출 — 손익에서는 투자 회수로
  filBuy: number // 필라멘트 산 돈 — 손익에서는 뜯은 스풀로
  byCat: Record<ExpenseCategory, number>
}

const CATS: ExpenseCategory[] = ['invest', 'filament', 'part', 'pack', 'supply', 'sub', 'sell', 'tax', 'etc']

export function calc(months: PlMonth[]): PlResult {
  const add = (f: (m: PlMonth) => number) => months.reduce((a, m) => a + f(m), 0)
  const byCat = Object.fromEntries(CATS.map((c) => [c, add((m) => m.expenses[c] ?? 0)])) as Record<
    ExpenseCategory,
    number
  >
  const gross = add((m) => m.gross)
  const shipping = add((m) => m.shipping)
  const fee = add((m) => m.fee)
  const settle = gross + shipping - fee
  const revenue = gross + shipping
  const spool = add((m) => m.spool)
  const partUsed = add((m) => m.parts_used)
  const material = spool + partUsed
  const grossProfit = revenue - material
  const ops = { fee, sell: byCat.sell, sub: byCat.sub, supply: byCat.supply, etc: byCat.etc }
  const opsSum = ops.fee + ops.sell + ops.sub + ops.supply + ops.etc
  const operating = grossProfit - opsSum
  const tax = byCat.tax
  const net = operating - tax
  const outAll = CATS.reduce((a, c) => a + byCat[c], 0)
  return {
    gross,
    shipping,
    fee,
    settle,
    sales: add((m) => m.sales),
    revenue,
    spool,
    spools: add((m) => m.spools),
    unpriced: add((m) => m.spools_unpriced),
    partUsed,
    partUnpriced: add((m) => m.parts_unpriced),
    partBuy: byCat.part + byCat.pack,
    material,
    grossProfit,
    ops,
    opsSum,
    operating,
    tax,
    net,
    outAll,
    cash: settle - outAll,
    invest: byCat.invest,
    filBuy: byCat.filament,
    byCat,
  }
}

// 기간에 드는 달
export function monthsIn(months: PlMonth[], p: Period) {
  if (p.kind === 'all') return months
  if (p.kind === 'year') return months.filter((m) => m.month.startsWith(`${p.y}-`))
  return months.filter((m) => m.month === p.m)
}

// 투자 회수 (PL-02): 처음부터 지금까지 손익 기준 순이익 ÷ 장비 지출 합계. 장비 지출이 없으면 null
export function recovery(all: PlResult) {
  return all.invest ? all.net / all.invest : null
}

// 그 달에 판매 · 지출 · 사용 시작한 스풀이 하나도 없으면 true (기간 고르기에서 흐리게)
export const isEmptyMonth = (m: PlMonth) => m.sales === 0 && m.spools === 0 && CATS.every((c) => !(m.expenses[c] ?? 0))

// 월별 그래프 한 칸 (PL-04). 손익 기준: 매출 · 비용(재료비 + 운영비 + 세금) · 순이익 / 현금 기준: 들어온 · 나간 · 남은 돈 + 누적 잔액
export interface ChartCol {
  month: string
  a: number // 초록 막대
  b: number // 회색 막대
  v: number // 아래 숫자 (손익: 순이익, 현금: 그 달 남은 돈)
  acc: number // 처음부터 그 달까지 누적 잔액 (현금 기준 선)
}

export function chartCols(months: PlMonth[], basis: Basis): ChartCol[] {
  let acc = 0
  return months.map((m) => {
    const c = calc([m])
    acc += c.cash
    return basis === 'pl'
      ? { month: m.month, a: c.revenue, b: c.material + c.opsSum + c.tax, v: c.net, acc }
      : { month: m.month, a: c.settle, b: c.outAll, v: c.cash, acc }
  })
}

// 그래프 눈금 간격: 1 · 2 · 5 × 10ⁿ
export function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

// 그래프 숫자: 만 원 단위 (127,700 → "13만", −31,500 → "−3만", 0 → "0")
export function manText(n: number) {
  const v = Math.round(n / 10000)
  return v === 0 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ko-KR') + '만'
}

// 음수는 앞에 "−" (목록 won() 은 음수를 "-1,000원" 으로 보여 주므로 손익은 이걸로)
export const signedWon = (n: number) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원'
