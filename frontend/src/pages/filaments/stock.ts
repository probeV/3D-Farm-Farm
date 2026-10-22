// 필라멘트 화면에서 계산하는 재고 값 (docs/api.md "화면에서 계산하는 값")
import type { ByStatus, Color, Filament } from '../../api/filaments'

export const STATUSES = ['sealed', 'open', 'empty'] as const

export const STATUS_LABEL = { sealed: '재고', open: '사용 중', empty: '사용 완료' } as const

const zero = (): ByStatus => ({ sealed: 0, open: 0, empty: 0 })

// 필라멘트의 상태별 kg = Σ 색상별 스풀 개수 × 스풀 무게
export function filamentKg(f: Filament): ByStatus {
  const kg = zero()
  for (const c of f.colors) for (const s of STATUSES) kg[s] += (c.counts[s] * f.spool_g) / 1000
  return kg
}

export function sumByStatus(list: ByStatus[]): ByStatus {
  const sum = zero()
  for (const v of list) for (const s of STATUSES) sum[s] += v[s]
  return sum
}

// 보유 = 재고 + 사용 중
export const heldOf = (v: ByStatus) => v.sealed + v.open

export const totalOf = (v: ByStatus) => v.sealed + v.open + v.empty

// 재고 없음 = 재고 0 이고 사용 중 1개 이상, 소진 = 재고 · 사용 중 모두 0
export function colorState(c: Color): 'ok' | 'noStock' | 'usedUp' {
  if (c.counts.sealed > 0) return 'ok'
  return c.counts.open > 0 ? 'noStock' : 'usedUp'
}
