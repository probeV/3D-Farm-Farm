// 제품 목록의 검색 · 필터 · 정렬 (PRD-01b · PRD-03, docs/screens.md 2.3). 요약 · CSV 는 검색 · 필터와 상관없이 전체
import type { Color } from '../../../api/filaments'
import type { Product } from '../../../api/products'
import { compareBy, type SortColumns, type SortState } from '../../../sort'
import { inSelection, type CategorySel } from '../categories'
import { completeMargin, type Cost } from '../cost'

export interface ProductRow {
  product: Product
  cost: Cost
  colors: Color[]
}

const byNo = (a: ProductRow, b: ProductRow) => a.product.no - b.product.no

// 열 제목 정렬 (PRD-01b). 입력이 덜 된 제품의 순이익 · 순마진율은 정확하지 않아 방향과 상관없이 맨 뒤
export const SORT_COLUMNS = {
  no: { value: (r) => r.product.no },
  name: { value: (r) => r.product.name },
  grams: { value: (r) => r.cost.grams || null, first: 'desc' },
  minutes: { value: (r) => r.product.print_minutes, first: 'desc' },
  cost: { value: (r) => r.cost.cost, first: 'desc' },
  price: { value: (r) => r.product.sale_price, first: 'desc' },
  net: { value: (r) => (r.cost.warnings.length ? null : r.cost.net), first: 'desc' },
  margin: { value: (r) => completeMargin(r.cost) },
} satisfies SortColumns<ProductRow, string>

export type Sort = SortState<keyof typeof SORT_COLUMNS>

export interface ListFilter {
  q: string
  category: CategorySel
  needOnly: boolean // `입력 필요` 카드를 눌러 입력이 덜 된 제품만
  sort: Sort
}

export const NO_FILTER: ListFilter = { q: '', category: '', needOnly: false, sort: { key: 'no', dir: 'asc' } }

// 검색: 제품명 · No. · 색상 이름
export function filterProducts(rows: ProductRow[], filter: ListFilter) {
  const q = filter.q.trim().toLowerCase()
  return rows
    .filter(
      ({ product, cost, colors }) =>
        inSelection(product, filter.category) &&
        (!filter.needOnly || cost.warnings.length > 0) &&
        (!q || [product.no, product.name, ...colors.map((c) => c.name)].join(' ').toLowerCase().includes(q)),
    )
    .sort(compareBy(SORT_COLUMNS, filter.sort, byNo))
}

// 맨 위 요약 (PRD-02). 평균 순마진율은 판매중이고 입력이 끝난 제품만
export function summarize(rows: ProductRow[]) {
  const count = (status: Product['status']) => rows.filter((r) => r.product.status === status).length
  const margins = rows
    .filter((r) => r.product.status === 'on_sale')
    .map((r) => completeMargin(r.cost))
    .filter((m) => m != null)
  return {
    onSale: count('on_sale'),
    developing: count('developing'),
    discontinued: count('discontinued'),
    total: rows.length,
    avgMargin: margins.length ? margins.reduce((a, m) => a + m, 0) / margins.length : null,
    avgBase: margins.length, // 평균에 들어간 제품 수 (툴팁용)
    needInput: rows.filter((r) => r.cost.warnings.length).length,
  }
}
