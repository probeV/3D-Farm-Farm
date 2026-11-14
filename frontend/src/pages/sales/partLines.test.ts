import { describe, expect, it } from 'vitest'
import type { Product } from '../../api/products'
import { applyDiff, defaultUsage, partInputs, partLine, savedPartLine } from './partLines'

const product = (id: number, parts: [number, number][]) =>
  ({ id, parts: parts.map(([part, qty], i) => ({ id: i, part, qty })) }) as unknown as Product

// 클리커: 청축 스위치(1) 1개 + 후크 키링(2) 1개 / 키링: 자석(3) 2개
const products = new Map([
  [
    10,
    product(10, [
      [1, 1],
      [2, 1],
    ]),
  ],
  [20, product(20, [[3, 2]])],
])
const qtys = (lines: { part: string; qty: string }[]) => lines.map((l) => [l.part, l.qty])

describe('판매 부속품 줄', () => {
  it('기본 = 제품의 사용 부속품 × 수량 (같은 부속품은 합침)', () => {
    const usage = defaultUsage(
      [
        { product: '10', qty: '3' },
        { product: '20', qty: '2' },
        { product: '', qty: '5' },
      ],
      products,
    )
    expect([...usage]).toEqual([
      [1, 3],
      [2, 3],
      [3, 4],
    ])
  })

  it('수량을 바꾸면 차이만큼', () => {
    const before = defaultUsage([{ product: '10', qty: '3' }], products)
    const after = defaultUsage([{ product: '10', qty: '5' }], products)
    const { lines } = applyDiff([partLine(1, 3), partLine(2, 3)], before, after)
    expect(qtys(lines)).toEqual([
      ['1', '5'],
      ['2', '5'],
    ])
  })

  it('제품 줄을 빼면 그 부속품도 빠짐 (0 이하면 줄을 뺌)', () => {
    const before = defaultUsage(
      [
        { product: '10', qty: '3' },
        { product: '20', qty: '1' },
      ],
      products,
    )
    const after = defaultUsage([{ product: '20', qty: '1' }], products)
    const { lines } = applyDiff([partLine(1, 3), partLine(2, 3), partLine(3, 2)], before, after)
    expect(qtys(lines)).toEqual([['3', '2']])
  })

  it('바꾼 부속품(청축 → 적축)은 그대로 두고, 늘어난 기본 부속품은 새 줄 · 줄어든 건 알려 줌', () => {
    const swapped = [partLine(9, 3), partLine(2, 3)] // 청축(1) 대신 적축(9)
    const more = applyDiff(
      swapped,
      defaultUsage([{ product: '10', qty: '3' }], products),
      defaultUsage([{ product: '10', qty: '4' }], products),
    )
    expect(qtys(more.lines)).toEqual([
      ['9', '3'],
      ['2', '4'],
      ['1', '1'],
    ])
    const less = applyDiff(
      swapped,
      defaultUsage([{ product: '10', qty: '3' }], products),
      defaultUsage([{ product: '10', qty: '2' }], products),
    )
    expect(qtys(less.lines)).toEqual([
      ['9', '3'],
      ['2', '2'],
    ])
    expect(less.missed).toEqual([1])
  })

  it('저장 값: 지운 부속품 줄은 이름만', () => {
    const deleted = savedPartLine({ part: null, part_name: '옛 자석', qty: 2 })
    expect(partInputs([partLine(1, '1.5'), deleted, { ...partLine(2, 1), part: '' }])).toEqual([
      { part: 1, part_name: '', qty: 1.5 },
      { part: null, part_name: '옛 자석', qty: 2 },
    ])
  })
})
