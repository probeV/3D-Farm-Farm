// 판매 창의 부속품 줄 값 · 계산. 화면은 SaleParts.tsx
// 서버는 받은 부속품 줄을 그대로 믿는다 — 제품 · 수량이 바뀔 때 줄을 맞추는 건 여기(화면)의 일
import type { Part, Product } from '../../api/products'
import type { SalePart, SalePartInput } from '../../api/sales'
import { num } from './packLines'

// 부속품 줄 하나 (입력칸 값)
export interface PartLine {
  key: number
  part: string // 부속품 id, '' = 부속품을 지운 줄 (이름만 남음)
  part_name: string
  qty: string
}

let partKey = 0
export const partLine = (part: number, n: number | string): PartLine => ({
  key: ++partKey,
  part: String(part),
  part_name: '',
  qty: String(n),
})
export const savedPartLine = (p: SalePart | SalePartInput): PartLine => ({
  key: ++partKey,
  part: p.part == null ? '' : String(p.part),
  part_name: p.part_name,
  qty: String(p.qty),
})

// 제품 줄 → 기본 부속품 {부속품 id: 수량} = 제품의 사용 부속품 × 판매 수량 (원가 계산과 같은 정의)
export function defaultUsage(items: { product: string; qty: string }[], products: Map<number, Product>) {
  const out = new Map<number, number>()
  for (const it of items) {
    const p = it.product ? products.get(Number(it.product)) : undefined
    if (!p) continue
    for (const row of p.parts) out.set(row.part, (out.get(row.part) ?? 0) + row.qty * num(it.qty))
  }
  return out
}

// 소수 둘째 자리까지 (0.1 + 0.2 같은 오차 없이)
const round2 = (v: number) => Math.round(v * 100) / 100

// 제품 줄이 바뀌면 기본 부속품의 차이만큼 줄을 맞춘다 (사용자가 바꾼 부속품은 그대로).
// 같은 부속품 줄이 있으면 수량에 더하고(0 이하면 뺌), 없으면 늘어난 만큼 새 줄.
// 줄어드는데 그 부속품 줄이 없으면(청축 → 적축처럼 사용자가 바꿈) 손대지 않고 missed 로 알려 준다
export function applyDiff(lines: PartLine[], before: Map<number, number>, after: Map<number, number>) {
  let out = [...lines]
  const missed: number[] = []
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const d = round2((after.get(id) ?? 0) - (before.get(id) ?? 0))
    if (!d) continue
    const i = out.findIndex((l) => l.part === String(id))
    if (i >= 0) {
      const q = round2(num(out[i].qty) + d)
      out = q > 0 ? out.map((l, j) => (j === i ? { ...l, qty: String(q) } : l)) : out.filter((_, j) => j !== i)
    } else if (d > 0) out.push(partLine(id, d))
    else missed.push(id)
  }
  return { lines: out, missed }
}

// 저장할 값: 고른 부속품 줄 (+ 지운 부속품 줄은 이름 그대로)
export const partInputs = (lines: PartLine[]): SalePartInput[] =>
  lines
    .filter((l) => l.part || l.part_name)
    .map((l) => ({ part: l.part ? Number(l.part) : null, part_name: l.part_name, qty: num(l.qty) }))

// 부속품 줄 안내 문구: 줄었는데 맞출 줄이 없었던 부속품 이름
export const missedNote = (missed: number[], parts: Map<number, Part>) =>
  missed.length
    ? `${missed.map((id) => parts.get(id)?.name ?? '부속품').join(', ')} 줄 없음 · 바꾼 부속품 수량 확인`
    : ''
