// 지출의 구매 줄 (v2 TBD-31) — 화면 계산. 서버: backend/expenses/models.py split_totals · serializers.py _check_lines
// 필라멘트 지출은 색상 · 통 수, 부속품 · 포장재 · 소모품 지출은 그 탭의 품목 · 수량. 금액을 비운 줄은 총액에서 나눠 넣는다
import { ApiError } from '../../api/client'
import type { Expense, ExpenseCategory, ExpenseLineInput } from '../../api/expenses'
import type { PartKind } from '../../api/products'

// 분류 → 고를 수 있는 재고 관리 탭 (필라멘트는 색상)
export const BUY_KINDS: Partial<Record<ExpenseCategory, PartKind>> = { part: 'part', pack: 'pack', supply: 'supply' }

export type BuyField = 'color' | 'part'

// 구매 줄을 적는 분류면 'color' | 'part', 아니면 null
export const buyField = (category: ExpenseCategory | ''): BuyField | null =>
  category === 'filament' ? 'color' : category && BUY_KINDS[category] ? 'part' : null

// 입력칸 한 줄. pick = 고른 색상 · 품목 id (null = 아직 안 고름 → 저장할 때 뺌)
export interface BuyRow {
  key: number // 화면 목록 key
  id?: number // 기존 줄
  pick: number | null
  qty: string
  amount: string // 빈칸 = 나눠 넣기
  spools: number // 이 줄로 등록한 스풀 수 (필라멘트)
}

let nextKey = 1
export const emptyRow = (): BuyRow => ({ key: nextKey++, pick: null, qty: '1', amount: '', spools: 0 })

export const rowsOf = (expense: Expense | null | undefined, copy = false): BuyRow[] =>
  (expense?.lines ?? []).map((l) => ({
    key: nextKey++,
    // 복제는 새 줄로 (등록한 스풀은 원래 지출에 남음)
    ...(copy ? {} : { id: l.id }),
    pick: l.color ?? l.part,
    qty: String(l.qty),
    amount: l.amount == null ? '' : String(l.amount),
    spools: copy ? 0 : l.spools,
  }))

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')))

// 고른 줄만 숫자로. 수량이 숫자가 아니면 NaN 그대로 (checkRows 가 걸러 냄)
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

// 줄 금액: 금액 적은 줄은 그대로, 비운 줄은 (총액 − 적은 금액 합계)를 나눔 — 필라멘트는 통 수대로, 그 밖은 똑같이
export function splitTotals(category: ExpenseCategory | '', amount: number, rows: ParsedRow[]): number[] {
  const weight = (r: ParsedRow) => (category === 'filament' ? r.qty || 0 : 1)
  const blank = rows.filter((r) => r.amount == null)
  const left = amount - rows.reduce((a, r) => a + (r.amount ?? 0), 0)
  const weights = blank.reduce((a, r) => a + weight(r), 0)
  return rows.map((r) => r.amount ?? (weights ? (left * weight(r)) / weights : 0))
}

// 저장 전 검사 (1차). 문제가 있으면 한 줄 문구 — 서버도 같은 규칙으로 다시 검사
export function checkRows(category: ExpenseCategory | '', amount: number | null, rows: BuyRow[]): string | null {
  const parsed = parseRows(rows)
  for (const r of parsed) {
    if (!(r.qty > 0)) return '수량을 확인하세요'
    if (category === 'filament' && !Number.isInteger(r.qty)) return '통 수는 정수로 적어요'
    if (r.amount != null && !(Number.isInteger(r.amount) && r.amount >= 0)) return '줄 금액을 확인하세요'
    if (r.row.spools > r.qty) return `스풀 ${r.row.spools}통을 이미 등록했어요`
  }
  if (new Set(parsed.map((r) => r.pick)).size < parsed.length) return '같은 것이 두 줄 있어요'
  if (category !== 'filament' && parsed.filter((r) => r.amount == null).length > 1) return '여러 가지면 줄마다 금액'
  const fixed = parsed.reduce((a, r) => a + (r.amount ?? 0), 0)
  if (amount != null && fixed > amount) return '줄 금액 합계가 지출 금액보다 커요'
  return null
}

export const toInput = (field: BuyField, rows: BuyRow[]): ExpenseLineInput[] =>
  parseRows(rows).map((r) => ({
    ...(r.row.id != null ? { id: r.row.id } : {}),
    color: field === 'color' ? r.pick : null,
    part: field === 'part' ? r.pick : null,
    qty: r.qty,
    amount: r.amount,
  }))

// 이 지출(날짜 date)의 그 색상 · 품목이 '최근 구매'인지 — 더 늦은 지출에 같은 것이 없으면.
// 같은 날이면 나중에 넣은 지출이 최근 (서버: 지출 날짜 → 지출 id 순). 새 지출은 같은 날 다른 지출보다 나중
export function isLatest(all: Expense[], current: Expense | null, field: BuyField, pick: number, date: string) {
  return !all.some(
    (y) =>
      y.id !== current?.id &&
      (y.date > date || (y.date === date && current != null && y.id > current.id)) &&
      y.lines.some((l) => l[field] === pick),
  )
}

// 목록 항목 옆 표시: `🧵 6통 · 등록 3` / `📦 네오디뮴 200개 · 소형 50개`
export function buyMark(x: Expense): { text: string; title: string } | null {
  if (!x.lines.length) return null
  if (x.category === 'filament') {
    const n = x.lines.reduce((a, l) => a + l.qty, 0)
    const done = x.lines.reduce((a, l) => a + l.spools, 0)
    return {
      text: `🧵 ${n}통 · 등록 ${done}`,
      title: `스풀 ${n}통 · 등록 ${done}통 · ${x.lines.map((l) => `${l.name} ${l.qty}통`).join(', ')}`,
    }
  }
  return {
    text: `📦 ${x.lines.map((l) => `${l.name.split(' ')[0]} ${l.qty}${l.unit}`).join(' · ')}`,
    title: `재고 관리로 이어짐 · ${x.lines.map((l) => `${l.name} +${l.qty}${l.unit}`).join(', ')}`,
  }
}

// 서버 400 의 구매 줄 오류 → 한 줄. `{"lines": ["..."]}` 또는 줄마다 `{"lines": [{}, {"part": ["..."]}]}`
export function linesErrorMessage(e: unknown): string | null {
  if (!(e instanceof ApiError) || !e.body || typeof e.body !== 'object') return null
  const lines = (e.body as { lines?: unknown }).lines
  if (!Array.isArray(lines)) return null
  for (const [i, item] of lines.entries()) {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object') {
      const first = Object.values(item as Record<string, unknown>).find((v) => Array.isArray(v) && v.length)
      if (Array.isArray(first)) return `구매 ${i + 1}번째 줄: ${first[0]}`
    }
  }
  return null
}
