// 판매 창의 포장 줄 값 · 계산 (SALE-06). 화면은 SalePacks.tsx
import type { PackSet, Part } from '../../api/products'
import type { SalePackInput } from '../../api/sales'

// 주문의 포장 줄 하나 (입력칸 값). unit_price 는 입력칸이 아니라 포장재를 고를 때 복사해 둔 값 (팔 때 단가)
export interface PackLine {
  key: number
  part: string // 포장재 id, '' = 포장재를 지운 줄 (이름만 남음)
  part_name: string
  qty: string
  unit_price: number | null
}

let packKey = 0
export const packLine = (part: Part, n: number | string = 1): PackLine => ({
  key: ++packKey,
  part: String(part.id),
  part_name: '',
  qty: String(n),
  unit_price: part.unit_price,
})
export const savedPackLine = (p: Omit<SalePackInput, 'part'> & { part: number | null }): PackLine => ({
  key: ++packKey,
  part: p.part == null ? '' : String(p.part),
  part_name: p.part_name,
  qty: String(p.qty),
  unit_price: p.unit_price,
})

export const num = (v: string) => Number(v.replace(/,/g, '')) || 0
export const packAmount = (l: PackLine) => (l.unit_price ?? 0) * num(l.qty)

// 세트 구성을 지금 줄에 더한다 (같은 포장재는 수량을 합침, SALE-06)
export function addSet(lines: PackLine[], set: PackSet, parts: Map<number, Part>): PackLine[] {
  const out = [...lines]
  for (const l of set.lines) {
    const i = out.findIndex((x) => x.part === String(l.part))
    if (i >= 0) out[i] = { ...out[i], qty: String(num(out[i].qty) + l.qty) }
    else {
      const p = parts.get(l.part)
      if (p) out.push(packLine(p, l.qty))
    }
  }
  return out
}

// 저장할 값: 고른 포장재 줄 (+ 지운 포장재 줄은 이름 그대로)
export const packInputs = (lines: PackLine[]): SalePackInput[] =>
  lines
    .filter((l) => l.part || l.part_name)
    .map((l) => ({
      part: l.part ? Number(l.part) : null,
      part_name: l.part_name,
      qty: num(l.qty),
      unit_price: l.unit_price,
    }))
