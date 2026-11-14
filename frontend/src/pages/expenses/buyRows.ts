// 지출의 구매 항목 (v2 TBD-31 · 33) — 화면 계산. 서버: backend/expenses/models.py split_totals · serializers.py _check_items
// 필라멘트 지출은 색상 · 롤 수, 부속품 · 포장재 · 소모품 지출은 그 탭의 품목 · 수량. 금액을 비운 항목은 총액에서 나눠 넣는다.
// 같은 색상 · 품목도 여러 항목 가능. 필라멘트 항목은 저장하면 롤 수만큼 스풀이 생긴다 (지출 → 스풀 한 방향, 차이만)
import { ApiError } from '../../api/client'
import type { Expense, ExpenseCategory, ExpenseItemInput } from '../../api/expenses'
import type { PartKind } from '../../api/products'

// 분류 → 고를 수 있는 재고 관리 탭 (필라멘트는 색상)
export const BUY_KINDS: Partial<Record<ExpenseCategory, PartKind>> = { part: 'part', pack: 'pack', supply: 'supply' }

export type BuyField = 'color' | 'part'

// 구매 항목을 적는 분류면 'color' | 'part', 아니면 null
export const buyField = (category: ExpenseCategory | ''): BuyField | null =>
  category === 'filament' ? 'color' : category && BUY_KINDS[category] ? 'part' : null

// 입력칸 한 줄 = 구매 항목 하나. pick = 고른 색상 · 품목 id (null = 아직 안 고름 → 저장할 때 뺌)
export interface BuyRow {
  key: number // 화면 목록 key
  id?: number // 기존 항목
  pick: number | null
  qty: string
  amount: string // 빈칸 = 나눠 넣기
  was: number // 저장된 롤 수 (새 항목은 0) — 스풀이 몇 개 생기고 지워지는지 (차이만)
  spools: number // 이 항목으로 만든 스풀 수 (필라멘트)
  used: number // 그중 사용한 수 — 색상 변경 · 빼기 불가, 롤 수는 재고 스풀만큼만 줄이기
}

let nextKey = 1
export const emptyRow = (): BuyRow => ({ key: nextKey++, pick: null, qty: '1', amount: '', was: 0, spools: 0, used: 0 })

export const rowsOf = (expense: Expense | null | undefined, copy = false): BuyRow[] =>
  (expense?.items ?? []).map((it) => ({
    key: nextKey++,
    // 복제는 새 항목으로 (스풀은 새로 생김)
    ...(copy ? {} : { id: it.id }),
    pick: it.color ?? it.part,
    qty: String(it.qty),
    amount: it.amount == null ? '' : String(it.amount),
    was: copy ? 0 : it.qty,
    spools: copy ? 0 : it.spools,
    used: copy ? 0 : it.used,
  }))

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')))

// 고른 항목만 숫자로. 수량이 숫자가 아니면 NaN 그대로 (checkRows 가 걸러 냄)
export interface ParsedRow {
  row: BuyRow
  pick: number
  qty: number
  amount: number | null
}
export const parseRows = (rows: BuyRow[]): ParsedRow[] =>
  rows
    .filter((r) => r.pick != null)
    .map((r) => ({ row: r, pick: r.pick!, qty: num(r.qty) ?? NaN, amount: num(r.amount) }))

// 항목 금액: 금액 적은 항목은 그대로, 비운 항목은 (총액 − 적은 금액 합계)를 나눔 — 필라멘트는 롤 수대로, 그 밖은 똑같이
export function splitTotals(category: ExpenseCategory | '', amount: number, rows: ParsedRow[]): number[] {
  const weight = (r: ParsedRow) => (category === 'filament' ? r.qty || 0 : 1)
  const blank = rows.filter((r) => r.amount == null)
  const left = amount - rows.reduce((a, r) => a + (r.amount ?? 0), 0)
  const weights = blank.reduce((a, r) => a + weight(r), 0)
  return rows.map((r) => r.amount ?? (weights ? (left * weight(r)) / weights : 0))
}

// 평균 단가(이동평균, v2 PL — 서버 stock/services.py mix 와 같음): 남은 수량(0 아래면 0) × 지금 평균 + 산 수량 × 단가
// → 새 평균. 지금 평균을 모르거나 남은 게 없으면 산 단가
export function nextAverage(stock: number, avg: number | null, qty: number, each: number) {
  const base = Math.max(stock, 0)
  return avg == null || base === 0 ? each : (base * avg + qty * each) / (base + qty)
}

// 필라멘트 항목: 저장하면 스풀이 몇 개 바뀌는지 (+ 생김, − 재고 스풀 지움). 새 항목은 롤 수만큼
export const spoolDiff = (r: BuyRow) => (Number(r.qty) || 0) - r.was

// 줄일 수 있는 최소 롤 수 = 저장된 롤 수 − 재고 스풀 수 (사용했거나 스풀에서 지운 것은 지출에서 못 지움)
export const minRolls = (r: BuyRow) => r.was - (r.spools - r.used)

// 저장 전 검사 (1차). 문제가 있으면 한 줄 문구 — 서버도 같은 규칙으로 다시 검사
export function checkRows(category: ExpenseCategory | '', amount: number | null, rows: BuyRow[]): string | null {
  const parsed = parseRows(rows)
  for (const r of parsed) {
    if (!(r.qty > 0)) return '수량을 확인하세요'
    if (category === 'filament' && !Number.isInteger(r.qty)) return '롤 수는 정수로 적어요'
    if (r.amount != null && !(Number.isInteger(r.amount) && r.amount >= 0)) return '항목 금액을 확인하세요'
    if (category === 'filament' && r.row.id != null && r.qty < minRolls(r.row))
      return `재고 스풀이 ${r.row.spools - r.row.used}개라 ${minRolls(r.row)}롤보다 적게 줄일 수 없어요`
  }
  if (category !== 'filament' && parsed.filter((r) => r.amount == null).length > 1) return '여러 가지면 항목마다 금액'
  const fixed = parsed.reduce((a, r) => a + (r.amount ?? 0), 0)
  if (amount != null && fixed > amount) return '항목 금액 합계가 지출 금액보다 커요'
  return null
}

export const toInput = (field: BuyField, rows: BuyRow[]): ExpenseItemInput[] =>
  parseRows(rows).map((r) => ({
    ...(r.row.id != null ? { id: r.row.id } : {}),
    color: field === 'color' ? r.pick : null,
    part: field === 'part' ? r.pick : null,
    qty: r.qty,
    amount: r.amount,
  }))

// 목록 항목 옆 표시: `🧵 6롤` / `📦 네오디뮴 200개 · 소형 50개`
export function buyMark(x: Expense): { text: string; title: string } | null {
  if (!x.items.length) return null
  if (x.category === 'filament') {
    const n = x.items.reduce((a, it) => a + it.qty, 0)
    const used = x.items.reduce((a, it) => a + it.used, 0)
    return {
      text: `🧵 ${n}롤`,
      title: `스풀 ${n}개${used ? ` (사용 ${used})` : ''} · ${x.items.map((it) => `${it.name} ${it.qty}롤`).join(', ')}`,
    }
  }
  return {
    text: `📦 ${x.items.map((it) => `${it.name.split(' ')[0]} ${it.qty}${it.unit}`).join(' · ')}`,
    title: `재고 관리로 이어짐 · ${x.items.map((it) => `${it.name} +${it.qty}${it.unit}`).join(', ')}`,
  }
}

// 서버 400 의 구매 항목 오류 → 한 줄. `{"items": ["..."]}` 또는 항목마다 `{"items": [{}, {"part": ["..."]}]}`
export function itemsErrorMessage(e: unknown): string | null {
  if (!(e instanceof ApiError) || !e.body || typeof e.body !== 'object') return null
  const items = (e.body as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  for (const [i, item] of items.entries()) {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const first = Object.values(item as Record<string, unknown>).find((v) => Array.isArray(v) && v.length)
      if (Array.isArray(first)) return `구매 ${i + 1}번째 항목: ${first[0]}`
    }
  }
  return null
}
