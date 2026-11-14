// 설정 분류 · 항목 · 검증 스키마 (PRD 3.8, docs/screens.md 4장, 목업 docs/mockups/settings.html). 공통 규칙은 src/validation.ts,
// 서버 규칙은 backend/products/models.py CostSetting (소수 자리 · 범위를 같게 맞춘다). 값은 모두 CostSetting 한 행에 저장
import { z } from 'zod'
import type { CostSetting } from '../../api/products'
import { decimal, intRange, validate } from '../../validation'

export type SettingKey = keyof CostSetting

export interface SettingItem {
  key: SettingKey
  name: string
  desc: string
  unit: string
  def: number // 기본값 (서버 모델 기본값과 같음)
  uses?: string[] // 이 값을 쓰는 화면 (여러 곳에서 쓰는 값만 표시)
}

export type CalcKind = 'elec' | 'rec' | 'fee'

export interface SettingGroup {
  icon: string
  title: string
  calc: CalcKind // 묶음 제목 줄 오른쪽 계산 예시
  items: SettingItem[]
}

export type CategoryKey = 'cost' | 'store'

export interface SettingCategory {
  key: CategoryKey
  icon: string
  label: string
  desc: string
  effect: string // 저장 줄: "저장하면 …"
  groups: SettingGroup[]
}

// 프린터 구매가 · 예상 수명 · 출력 실패율은 뺐다 (투자 장비는 손익 PL-02 에서)
// 스마트스토어 연결 상태 묶음은 스마트스토어 연동(STORE-04) 때 이 분류에 추가
export const CATEGORIES: SettingCategory[] = [
  {
    key: 'cost',
    icon: '🧮',
    label: '제품 원가',
    desc: '제품 원가 · 권장 판매가 계산에 쓰는 값',
    effect: '모든 제품 원가에 바로 반영돼요',
    groups: [
      {
        icon: '⚡',
        title: '전기료',
        calc: 'elec',
        items: [
          { key: 'power_kw', name: '프린터 소비 전력', desc: '출력 중 평균 소비 전력', unit: 'kW', def: 0.36 },
          { key: 'elec_rate', name: '전기료 단가', desc: '1kWh 당 전기 요금', unit: '원/kWh', def: 215 },
        ],
      },
      {
        icon: '🏷️',
        title: '판매가',
        calc: 'rec',
        items: [
          {
            key: 'target_margin',
            name: '목표 마진율',
            desc: '제품 창의 권장 판매가 계산에만 써요',
            unit: '%',
            def: 40,
          },
        ],
      },
    ],
  },
  {
    key: 'store',
    icon: '🛒',
    label: '스마트스토어',
    desc: '연결 상태와 수수료 · 배송비',
    effect: '제품 원가와 새로 넣는 판매의 수수료에 반영돼요 (이미 넣은 판매는 그대로)',
    groups: [
      {
        icon: '💳',
        title: '수수료 · 배송비',
        calc: 'fee',
        items: [
          {
            key: 'fee_order',
            name: '네이버페이 주문관리 수수료',
            desc: '판매가 대비',
            unit: '%',
            def: 1.98,
            uses: ['제품 원가', '판매'],
          },
          {
            key: 'fee_sales',
            name: '스마트스토어 판매 수수료',
            desc: '판매가 대비 (유입 경로에 따라 다를 수 있음)',
            unit: '%',
            def: 2.73,
            uses: ['제품 원가', '판매'],
          },
          {
            key: 'shipping_cost',
            name: '건당 판매자 부담 배송비',
            desc: '무료배송이면 실제 택배비를 입력',
            unit: '원',
            def: 0,
            uses: ['제품 원가', '판매'],
          },
        ],
      },
    ],
  },
]

export const categoryOf = (key: CategoryKey) => CATEGORIES.find((c) => c.key === key)!
export const itemsOf = (c: SettingCategory) => c.groups.flatMap((g) => g.items)
export const ITEMS = CATEGORIES.flatMap(itemsOf)

const percent = decimal(0, 100, 2)

// 서버: power_kw DecimalField(max_digits=6, decimal_places=3) · elec_rate (8, 1) · % 칸 (5, 2, 0~100) · shipping_cost MONEY
export const settingSchema = z.object({
  power_kw: decimal(0, 999.999, 3),
  elec_rate: decimal(0, 9_999_999.9, 1),
  fee_order: percent,
  fee_sales: percent,
  shipping_cost: intRange(0, 9_999_999_999),
  target_margin: percent,
})

export type Values = Record<SettingKey, string>

// 저장된 값 → 입력칸 글자 (천 단위 쉼표: 3000 → "3,000")
export const toText = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 3 })

export const initialValues = (s: CostSetting) =>
  Object.fromEntries(ITEMS.map((it) => [it.key, toText(s[it.key])])) as Values

// 입력 중인 값 읽기 (한 분류): 칸별 숫자(틀린 칸 · 다른 분류는 저장된 값) + 오류 + 저장된 값과 다른 항목
export function readValues(values: Values, saved: CostSetting, cat: SettingCategory) {
  const items = itemsOf(cat)
  const all = validate(settingSchema, values)
  const errors = Object.fromEntries(items.filter((it) => all[it.key]).map((it) => [it.key, all[it.key]]))
  const numbers = { ...saved }
  for (const it of items) {
    if (errors[it.key]) continue
    numbers[it.key] = settingSchema.shape[it.key].parse(values[it.key]) as number
  }
  const changed = items.filter((it) => errors[it.key] || numbers[it.key] !== saved[it.key]).map((it) => it.key)
  return { numbers, errors, changed }
}

// 저장할 값: 이 분류의 항목만 (분류마다 저장)
export const pickCategory = (data: CostSetting, cat: SettingCategory) =>
  Object.fromEntries(itemsOf(cat).map((it) => [it.key, data[it.key]])) as Partial<CostSetting>

// 묶음 제목 줄의 계산 예시: 1시간 출력 전기료, 수수료 합계, 원가 1만원 제품 권장 판매가 (계산은 PRD 3.6 과 같음)
export function examples(s: CostSetting) {
  const feeRate = (s.fee_order + s.fee_sales) / 100
  const denom = 1 - feeRate - s.target_margin / 100
  return {
    hourElectricity: s.power_kw * s.elec_rate,
    feeRate,
    fee20k: 20000 * feeRate,
    recommended10k: denom > 0 ? Math.ceil((10000 + s.shipping_cost) / denom / 100 - 1e-9) * 100 : null,
  }
}
