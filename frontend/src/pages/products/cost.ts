// 제품 원가 계산 (PRD 3.6 "원가 계산 규칙", 제품 1개 기준). 목록 · 제품 창 미리보기 · CSV 가 모두 이 계산을 쓴다
// 서버는 원가를 계산하지 않는다 (docs/api.md "화면에서 계산하는 값")
import type { Color, Filament } from '../../api/filaments'
import type { CostSetting, PackSet, Part, PartCategory } from '../../api/products'
import { minutesText, won } from '../../format'

// 계산에 필요한 목록을 id 로 찾을 수 있게 모아 둔 것
export interface Catalog {
  filaments: Map<number, Filament>
  colors: Map<number, Color>
  parts: Map<number, Part> // 재고 품목 전부 (부속품 · 포장재 · 소모품)
  packSets: Map<number, PackSet> // 포장 세트 (v2 STOCK-06)
  setting: CostSetting
}

export function makeCatalog(
  filaments: Filament[],
  parts: Part[],
  setting: CostSetting,
  packSets: PackSet[] = [],
): Catalog {
  return {
    filaments: new Map(filaments.map((f) => [f.id, f])),
    colors: new Map(filaments.flatMap((f) => f.colors).map((c) => [c.id, c])),
    parts: new Map(parts.map((p) => [p.id, p])),
    packSets: new Map(packSets.map((s) => [s.id, s])),
    setting,
  }
}

// 원가 계산에 쓰는 제품 값 — 저장된 제품(Product) 또는 제품 창에서 입력 중인 값
export interface CostInput {
  print_minutes: number | null
  sale_price: number | null
  filaments: { filament: number; color: number | null; grams: number }[]
  parts: { part: number; qty: number }[]
  default_pack: number | null // 기본 포장 세트 (1개 보낼 때). null = 입력 필요
}

export interface Cost {
  grams: number // 필라멘트 사용량 합계
  filament: number // 필라멘트비
  electricity: number // 전기료
  parts: number // 부속품비
  pack: number // 포장비 = 기본 포장 세트 원가 (v2 STOCK-06)
  cost: number // 원가 = 위 네 항목 합계 (판매에 복사할 때는 포장을 뺀 cost − pack, SALE-05)
  feeRate: number // 수수료율 (0.0471 = 4.71%)
  fee: number // 수수료 (판매가가 없으면 0)
  net: number | null // 순이익 (판매가가 없으면 null)
  margin: number | null // 순마진율 (0.25 = 25%)
  recommended: number | null // 권장 판매가 (100원 단위 올림). 수수료율 + 목표 마진율이 100% 이상이면 null
  warnings: string[] // 입력이 덜 된 항목. 하나라도 있으면 "입력 필요" (PRD-09)
  packWarnings: string[] // 그중 포장비 쪽 (판매에 복사하는 원가는 포장을 빼므로 따로, sales/saleList.ts snapshotCost)
}

// 줄의 스풀 가격: 고른 색상의 spool_price(보유 스풀 평균 → 색상 가격 → 필라멘트 가격, 서버 계산), 색상을 안 고르면 필라멘트 가격
function spoolPrice(catalog: Catalog, filament: Filament, colorId: number | null) {
  const color = colorId == null ? undefined : catalog.colors.get(colorId)
  return color && color.filament === filament.id ? color.spool_price : filament.price
}

// 필라멘트 줄 하나의 금액. 가격이 없으면 null (0원으로 계산하고 경고)
export function filamentAmount(catalog: Catalog, row: CostInput['filaments'][number]) {
  const filament = catalog.filaments.get(row.filament)
  const price = filament && spoolPrice(catalog, filament, row.color)
  return filament && price != null ? (row.grams * price) / filament.spool_g : null
}

// 부자재 줄 하나의 금액. 가격이 없으면 null
export function partAmount(catalog: Catalog, row: CostInput['parts'][number]) {
  const unitPrice = catalog.parts.get(row.part)?.unit_price
  return unitPrice == null ? null : row.qty * unitPrice
}

// 금액에 마우스를 올리면 보이는 단가 안내
export function filamentUnitText(catalog: Catalog, row: CostInput['filaments'][number]) {
  const filament = catalog.filaments.get(row.filament)
  if (!filament) return ''
  const price = spoolPrice(catalog, filament, row.color)
  if (price == null) return '필라멘트 가격 미입력 — 0원으로 계산'
  const color = row.color == null ? undefined : catalog.colors.get(row.color)
  const own = color && color.filament === filament.id ? color : undefined
  const prefix = own?.held_price != null ? '보유 스풀 평균 ' : own?.price != null ? '색상 가격 ' : ''
  const won = Math.round(price).toLocaleString('ko-KR')
  return `${prefix}${won}원 / ${filament.spool_g}g · g당 ${(price / filament.spool_g).toFixed(1)}원`
}

export function partUnitText(catalog: Catalog, row: CostInput['parts'][number]) {
  const part = catalog.parts.get(row.part)
  if (!part) return ''
  if (part.unit_price == null) return '가격 미입력 — 0원으로 계산'
  return `${part.unit}당 ${Math.round(part.unit_price).toLocaleString('ko-KR')}원`
}

export function calcCost(p: CostInput, catalog: Catalog): Cost {
  const S = catalog.setting
  const warnings = new Set<string>()

  let grams = 0
  let filament = 0
  for (const row of p.filaments) {
    grams += row.grams
    const amount = filamentAmount(catalog, row)
    if (amount == null) warnings.add(`${catalog.filaments.get(row.filament)?.display_name ?? '필라멘트'} 가격 미입력`)
    else filament += amount
  }
  if (!grams) warnings.add('필라멘트 사용량 미입력')
  if (!p.print_minutes) warnings.add('출력 시간 미입력')

  let parts = 0
  for (const row of p.parts) {
    const amount = partAmount(catalog, row)
    if (amount == null) warnings.add(`${catalog.parts.get(row.part)?.name ?? '부자재'} 가격 미입력`)
    else parts += amount
  }
  if (!p.sale_price) warnings.add('판매가 미입력')

  // 포장비: 기본 포장 세트의 포장재 줄 합계. 안 골랐으면 입력 필요, 가격 없는 포장재는 0원 + 경고
  let pack = 0
  const packWarnings = new Set<string>()
  const set = p.default_pack == null ? undefined : catalog.packSets.get(p.default_pack)
  if (!set) packWarnings.add('기본 포장 미입력')
  else
    for (const line of set.lines) {
      const amount = partAmount(catalog, line)
      if (amount == null) packWarnings.add(`${catalog.parts.get(line.part)?.name ?? '포장재'} 가격 미입력`)
      else pack += amount
    }
  packWarnings.forEach((w) => warnings.add(w))

  const hours = (p.print_minutes ?? 0) / 60
  const electricity = hours * S.power_kw * S.elec_rate
  // 프린터 감가상각 · 출력 실패 보정은 계산하지 않는다 (PRD 3.6, 추후 투자 장비 · 이윤 계산에서)
  const cost = filament + electricity + parts + pack

  const sale = p.sale_price || 0
  const feeRate = (S.fee_order + S.fee_sales) / 100
  const fee = sale * feeRate
  const net = sale ? sale - cost - fee - S.shipping_cost : null
  const denom = 1 - feeRate - S.target_margin / 100
  // 1e-9: 소수 계산 오차로 18900.0000001 이 19000 으로 올라가지 않게
  const recommended = denom > 0 ? Math.ceil((cost + S.shipping_cost) / denom / 100 - 1e-9) * 100 : null

  return {
    grams,
    filament,
    electricity,
    parts,
    pack,
    cost,
    feeRate,
    fee,
    net,
    margin: net == null ? null : net / sale,
    recommended,
    warnings: [...warnings],
    packWarnings: [...packWarnings],
  }
}

// 부자재비를 카테고리별로 (TBD-17): [{ name: '부품', amount: 720 }, …] 카테고리 이름순, 미분류는 맨 뒤.
// 가격 미입력은 0원 (원가 계산과 같음). 원가 내역에서 부자재비 아래 작은 글씨로 (카테고리가 2개 이상일 때만)
export function partsByCategory(p: CostInput, catalog: Catalog, categories: PartCategory[]) {
  const sums = new Map<number | null, number>()
  for (const row of p.parts) {
    const key = catalog.parts.get(row.part)?.category ?? null
    sums.set(key, (sums.get(key) ?? 0) + (partAmount(catalog, row) ?? 0))
  }
  const named = categories.filter((c) => sums.has(c.id)).map((c) => ({ name: c.name, amount: sums.get(c.id)! }))
  return sums.has(null) ? [...named, { name: '미분류', amount: sums.get(null)! }] : named
}

// 원가 내역 (?) 에 보여 줄 계산식: 위 calcCost 와 같은 식을 그 제품 값으로 (TBD-19).
// 필라멘트비 · 부자재비는 재료 표에 줄마다 금액이 있어 따로 두지 않는다
export function costFormulas(p: CostInput, c: Cost, S: CostSetting) {
  const sale = won(p.sale_price)
  const feePct = `${(c.feeRate * 100).toFixed(2)}%`
  const shipping = S.shipping_cost > 0
  return {
    electricity: `${p.print_minutes ? minutesText(p.print_minutes) : '0분'} × ${S.power_kw}kW × ${S.elec_rate}원/kWh = ${won(c.electricity)}`,
    cost: `필라멘트비 + 전기료 + 부속품비 + 포장비\n= ${won(c.filament)} + ${won(c.electricity)} + ${won(c.parts)} + ${won(c.pack)}`,
    fee: `판매가 × (주문관리 ${S.fee_order}% + 판매 ${S.fee_sales}%)\n= ${sale} × ${feePct}`,
    net: `판매가 − 원가 − 수수료${shipping ? ' − 배송비' : ''}\n= ${sale} − ${won(c.cost)} − ${won(c.fee)}${shipping ? ` − ${won(S.shipping_cost)}` : ''}`,
    margin: `순이익 ÷ 판매가\n= ${won(c.net)} ÷ ${sale}`,
    recommended: `(원가 + 배송비) ÷ (1 − 수수료율 − 목표 마진율), 100원 단위 올림\n= (${won(c.cost)} + ${won(S.shipping_cost)}) ÷ (1 − ${feePct} − ${S.target_margin}%)`,
  }
}

// 입력이 덜 된 제품의 순마진율은 정확하지 않으므로 null (목록 · 요약 · 정렬에서 빼거나 맨 뒤로)
export const completeMargin = (c: Cost) => (c.warnings.length ? null : c.margin)

// 제품에 쓰는 색상 (필라멘트 줄에서 고른 색상, 같은 색상은 한 번)
export function productColors(p: CostInput, catalog: Catalog): Color[] {
  const seen = new Map<number, Color>()
  for (const row of p.filaments) {
    const color = row.color == null ? undefined : catalog.colors.get(row.color)
    if (color && !seen.has(color.id)) seen.set(color.id, color)
  }
  return [...seen.values()]
}

// 순마진율 색: 0% 미만 빨강 / 20% 미만 주황 / 그 외 초록 (screens.md 2.3)
export function marginClass(margin: number | null) {
  if (margin == null) return 'muted'
  return margin < 0 ? 'm-bad' : margin < 0.2 ? 'm-warn' : 'm-good'
}
