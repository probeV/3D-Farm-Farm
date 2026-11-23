// QR 라벨 인쇄 화면의 계산 (TBD-18, docs/screens.md 1.10)
import type { Color, Filament, Spool } from '../../../api/filaments'
import type { LabelPick } from '../../../nav'

// 라벨 크기: 라벨 프린터 30×20 · 40×30 · 50×30mm (한 장씩), 예비로 A4 라벨지 24칸 (일반 프린터)
export const SIZES = {
  '30x20': '30 × 20 mm (라벨 프린터)',
  '40x30': '40 × 30 mm (라벨 프린터)',
  '50x30': '50 × 30 mm (라벨 프린터)',
  a4: 'A4 라벨지 24칸 (일반 프린터)',
} as const
export type LabelSize = keyof typeof SIZES

// QR 안의 주소: {앞부분}/s/{코드}. 앞부분은 backend/.env 의 PUBLIC_URL, 비었으면 지금 연 주소
export const baseUrl = (publicUrl: string, origin: string) => (publicUrl || origin).replace(/\/+$/, '')
export const qrUrl = (base: string, code: string) => `${base}/s/${code}`

// 폰에서 열 수 없는 주소 (이 PC 에서만 열림)
export const localOnly = (base: string) => /^https?:\/\/(localhost|127\.|\[::1\])/i.test(base)

// 라벨을 아직 안 뽑은 스풀 = 라벨 없음 (다 쓴 스풀은 붙일 일이 없어 뺌)
export const needsLabel = (s: Spool) => !s.label_printed && s.status !== 'empty'

export interface Row {
  spool: Spool
  color: Color
  filament: Filament
}

// 스풀에 색상 · 필라멘트를 붙인다 (색상을 못 찾는 스풀은 뺌). 새 번호 먼저
export function toRows(spools: Spool[], filaments: Filament[]): Row[] {
  const byColor = new Map(filaments.flatMap((f) => f.colors.map((c) => [c.id, { color: c, filament: f }] as const)))
  return spools
    .flatMap((spool) => {
      const found = byColor.get(spool.color)
      return found ? [{ spool, ...found }] : []
    })
    .sort((a, b) => b.spool.code_no - a.spool.code_no)
}

// 검색: 코드 · 색상 · 필라멘트
export function search(rows: Row[], q: string) {
  const word = q.trim().toLowerCase()
  if (!word) return rows
  return rows.filter((r) =>
    [r.spool.code, r.color.name, r.filament.display_name].join(' ').toLowerCase().includes(word),
  )
}

// 처음 골라 둘 스풀 id: 재고 추가로 만든 스풀 그대로 / 지출의 구매 항목이면 그 스풀 중 라벨 없는 것
export function initialPick(spools: Spool[], pick: LabelPick | null): Set<number> {
  if (!pick) return new Set()
  const ids = new Set(pick.ids ?? [])
  const buys = new Set(pick.buys ?? [])
  return new Set(
    spools.filter((s) => ids.has(s.id) || (s.buy != null && buys.has(s.buy) && needsLabel(s))).map((s) => s.id),
  )
}

// A4 24칸 라벨지: 3열 × 8행 (64 × 33.9mm)
export const A4_PER_PAGE = 24

// 인쇄용 페이지 크기 (@page)
export const PAGE_SIZE: Record<LabelSize, string> = {
  '30x20': '30mm 20mm',
  '40x30': '40mm 30mm',
  '50x30': '50mm 30mm',
  a4: 'A4',
}

// 인쇄할 때 QR 이 들어갈 수 있는 가장 큰 크기 (mm, 라벨 안 여백을 뺀 높이 기준)
export const QR_MAX_MM: Record<LabelSize, number> = { '30x20': 18, '40x30': 23, '50x30': 25, a4: 27 }

// 감열 라벨 프린터 점 하나 (203dpi = 1mm 에 8점 → 0.125mm, HPRT SL43 등)
export const DOT_MM = 0.125

// QR 크기를 프린터 점에 맞춘다: 칸(모듈) 하나 = 점 정수 개 → 칸마다 굵기가 같아 또렷하게 찍힘.
// units = 칸 수 (둘레 흰 여백 포함). 들어갈 수 있는 가장 큰 점 수 (적어도 1점)
export function qrPrintMm(units: number, maxMm: number, dotMm = DOT_MM) {
  const dots = Math.max(1, Math.floor(maxMm / units / dotMm))
  return units * dots * dotMm
}

// 위치 보정 (mm): 라벨 프린터마다 찍히는 위치가 조금씩 달라서 PC 마다 맞춘다. 숫자가 아니면 0, ±10mm 까지
export interface Offset {
  x: number // + 오른쪽 · − 왼쪽
  y: number // + 아래 · − 위
}
export function parseOffset(text: string) {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? Math.max(-10, Math.min(10, Math.round(n * 10) / 10)) : 0
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}
