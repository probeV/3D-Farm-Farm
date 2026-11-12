// 판매 목록의 기간 · 검색 · 정렬 · 요약 · 제품별 판매 · CSV · 수수료 계산 (v2 SALE, docs/screens.md 판매)
// 날짜는 "2026-10-23" 글자 그대로 비교한다 (같은 모양이라 글자 순서 = 날짜 순서)
import type { CostSetting } from '../../api/products'
import type { Cost } from '../products/cost'
import type { Sale, SaleChannel } from '../../api/sales'
import { toCsv } from '../../csv'
import { compareBy, type SortColumns, type SortState } from '../../sort'
import { inPeriod, type Period } from '../expenses/expenseList'
import { CHANNELS, channelLabel } from './channels'

export { inPeriod, PERIODS, type Period } from '../expenses/expenseList'

const monthOf = (date: string) => date.slice(0, 7)
const sumOf = (rows: Sale[], f: (s: Sale) => number | null) => rows.reduce((a, s) => a + (f(s) ?? 0), 0)
export const qtyOf = (s: Sale) => s.items.reduce((a, i) => a + i.qty, 0)

// ---------------------------------------------------------------- 수수료 (SALE-03)

// 스마트스토어 수수료 = (판매가 합계 + 받은 배송비) × (주문관리 + 판매 수수료%), 원 단위 반올림. 직접 판매 · 기타는 0
// 서버: Sale.store_fee (같은 규칙)
export function autoFee(channel: SaleChannel, gross: number, shippingReceived: number, setting: CostSetting) {
  if (channel !== 'store') return 0
  return Math.round(((gross + shippingReceived) * (setting.fee_order + setting.fee_sales)) / 100)
}

// ---------------------------------------------------------------- 제품 (제품을 지운 줄은 팔 때 이름으로 묶음)

// 제품별 판매 · 제품 필터의 묶음 키: 제품이 있으면 id, 지웠으면 이름
export const productKey = (i: { product: number | null; product_name: string }) =>
  i.product != null ? `p${i.product}` : `n${i.product_name}`

// ---------------------------------------------------------------- 기간 · 검색 · 정렬

const newestFirst = (a: Sale, b: Sale) => b.date.localeCompare(a.date) || b.id - a.id

export const SORT_COLUMNS = {
  date: { value: (s) => s.date, first: 'desc' },
  channel: { value: (s) => CHANNELS.findIndex((c) => c.key === s.channel) },
  product: { value: (s) => s.items[0]?.product_name ?? null },
  qty: { value: qtyOf, first: 'desc' },
  gross: { value: (s) => s.gross, first: 'desc' },
  shipping: { value: (s) => s.shipping_received, first: 'desc' },
  fee: { value: (s) => s.fee, first: 'desc' },
  settle: { value: (s) => s.settle, first: 'desc' },
  cost: { value: (s) => s.cost, first: 'desc' },
  profit: { value: (s) => s.profit, first: 'desc' }, // 원가 없는 주문은 맨 뒤
} satisfies SortColumns<Sale, string>

export type Sort = SortState<keyof typeof SORT_COLUMNS>

export interface ListFilter {
  q: string
  channel: SaleChannel | ''
  product: string // productKey, '' = 전체
  period: Period
  from: string
  to: string
  sort: Sort
}

export const NO_FILTER: ListFilter = {
  q: '',
  channel: '',
  product: '',
  period: 'all',
  from: '',
  to: '',
  sort: { key: 'date', dir: 'desc' },
}

// 검색: 제품명 · 주문번호 · 메모
export function filterSales(sales: Sale[], f: ListFilter, today: string) {
  const q = f.q.trim().toLowerCase()
  return sales
    .filter(
      (s) =>
        inPeriod(s.date, f, today) &&
        (!f.channel || s.channel === f.channel) &&
        (!f.product || s.items.some((i) => productKey(i) === f.product)) &&
        (!q || [s.order_no, s.note, ...s.items.map((i) => i.product_name)].join(' ').toLowerCase().includes(q)),
    )
    .sort(compareBy(SORT_COLUMNS, f.sort, newestFirst))
}

// ---------------------------------------------------------------- 요약 · 제품별 판매

// 카드: 이번 달 매출 · 정산 금액 · 주문 이익(원가 없는 주문 제외) · 누적 매출 (기간 필터와 상관없이)
export function summarize(sales: Sale[], today: string) {
  const month = sales.filter((s) => monthOf(s.date) === monthOf(today))
  const monthGross = sumOf(month, (s) => s.gross)
  const monthProfit = sumOf(month, (s) => s.profit)
  return {
    monthGross,
    monthCount: month.length,
    monthQty: month.reduce((a, s) => a + qtyOf(s), 0),
    monthSettle: sumOf(month, (s) => s.settle),
    monthFee: sumOf(month, (s) => s.fee),
    monthProfit,
    monthProfitRate: monthGross ? monthProfit / monthGross : null,
    monthNoCost: month.some((s) => s.profit == null),
    total: sumOf(sales, (s) => s.gross),
    count: sales.length,
    qty: sales.reduce((a, s) => a + qtyOf(s), 0),
    since: sales.length ? sales.map((s) => s.date).sort()[0] : null,
  }
}

// 제품별 판매: 기간 필터를 따른다. 판매가 합계 큰 순
export function byProduct(sales: Sale[]) {
  const map = new Map<string, { key: string; name: string; qty: number; amount: number }>()
  for (const s of sales)
    for (const i of s.items) {
      const key = productKey(i)
      const row = map.get(key) ?? { key, name: i.product_name, qty: 0, amount: 0 }
      row.qty += i.qty
      row.amount += i.amount
      map.set(key, row)
    }
  return [...map.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ko'))
}

// ---------------------------------------------------------------- CSV

const HEAD = [
  '날짜',
  '판매처',
  '주문번호',
  '제품',
  '수량',
  '판매가',
  '받은 배송비',
  '수수료',
  '정산 금액',
  '원가',
  '이익',
  '메모',
]

// 보이는 목록 그대로. 제품은 "분수 원판 세트 × 2 · 이름 키링 × 1"
export function salesCsv(rows: Sale[]) {
  return toCsv([
    HEAD,
    ...rows.map((s) => [
      s.date,
      channelLabel(s.channel),
      s.order_no,
      s.items.map((i) => `${i.product_name} × ${i.qty}`).join(' · '),
      qtyOf(s),
      s.gross,
      s.shipping_received,
      s.fee,
      s.settle,
      s.cost ?? '',
      s.profit ?? '',
      s.note,
    ]),
  ])
}

// ---------------------------------------------------------------- 원가 복사 (SALE-05)

// 판매할 때 복사하는 개당 원가: 원가 계산표 값을 원 단위로. 원가에 필요한 입력(가격 · 사용량 · 출력 시간)이
// 덜 됐으면 null (원가 없음). 판매가 미입력은 원가와 상관없어서 따지지 않는다
export function snapshotCost(cost: Cost) {
  return cost.warnings.some((w) => w !== '판매가 미입력') ? null : Math.round(cost.cost)
}
