// 제품 창의 입력값: 처음 값(추가 · 복제 · 수정)과 입력 중 원가 미리보기용 값
import type { Filament } from '../../../api/filaments'
import type { Product, ProductStatus } from '../../../api/products'
import type { CostInput } from '../cost'

// 줄마다 key: 줄을 빼도 다른 줄의 입력칸이 섞이지 않게 (React 목록 key)
export interface FilamentLine {
  key: number
  filament: string
  color: string // '' = 색상 선택 안 함
  grams: string
}

export interface PartLine {
  key: number
  part: string
  qty: string
}

// 입력칸 글자 그대로 (숫자 변환 · 검사는 schemas.ts). useForm 이 쓰므로 interface 가 아닌 type
export type Values = {
  no: string
  name: string
  category: string
  subcategory: string
  status: ProductStatus
  hours: string
  minutes: string
  sale_price: string
  default_pack: string // 기본 포장 세트 id, 빈칸 = 입력 필요
  note: string
  filaments: FilamentLine[]
  parts: PartLine[]
}

let lastKey = 0
export const newKey = () => ++lastKey

const str = (v: number | null | undefined) => (v == null ? '' : String(v))

// 다음 No. = 지금 가장 큰 번호 + 1
export const nextNo = (products: Product[]) => Math.max(0, ...products.map((p) => p.no)) + 1

export const newFilamentLine = (filaments: Filament[]): FilamentLine => ({
  key: newKey(),
  filament: str(filaments[0]?.id),
  color: '',
  grams: '',
})

export interface Start {
  product: Product | null // 수정할 제품 (null 이면 추가)
  copyOf?: Product // 복제할 원본: 재료까지 복사, No. 는 다음 번호, 이름 "(복사)", 상태 개발중 (PRD-04a)
  preset?: { category: number | null; subcategory: number | null } // 제품 관리 창에서 고른 카테고리 · 세부 분류
}

export function initialValues({ product, copyOf, preset }: Start, products: Product[], filaments: Filament[]): Values {
  const src = product ?? copyOf
  if (!src) {
    return {
      no: String(nextNo(products)),
      name: '',
      category: str(preset?.category),
      subcategory: str(preset?.subcategory),
      status: 'developing',
      hours: '',
      minutes: '',
      sale_price: '',
      default_pack: '',
      note: '',
      filaments: filaments.length ? [newFilamentLine(filaments)] : [],
      parts: [],
    }
  }
  const minutes = src.print_minutes
  return {
    no: product ? String(product.no) : String(nextNo(products)),
    name: product ? src.name : `${src.name} (복사)`,
    category: str(src.category),
    subcategory: str(src.subcategory),
    status: product ? src.status : 'developing',
    hours: minutes == null ? '' : String(Math.floor(minutes / 60)),
    minutes: minutes == null ? '' : String(minutes % 60),
    sale_price: str(src.sale_price),
    default_pack: str(src.default_pack),
    note: src.note,
    filaments: src.filaments.map((r) => ({
      key: newKey(),
      filament: String(r.filament),
      color: str(r.color),
      grams: String(r.grams),
    })),
    parts: src.parts.map((r) => ({ key: newKey(), part: String(r.part), qty: String(r.qty) })),
  }
}

// 입력 중인 글자 → 숫자 (틀린 글자는 비운 것으로). 저장 전 미리보기라 검사는 하지 않는다
function loose(v: string) {
  const t = v.trim().replace(/,/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function previewOf(v: Values): CostInput {
  const h = loose(v.hours)
  const m = loose(v.minutes)
  return {
    print_minutes: h == null && m == null ? null : (h ?? 0) * 60 + (m ?? 0),
    sale_price: loose(v.sale_price),
    filaments: v.filaments.map((r) => ({
      filament: Number(r.filament),
      color: r.color ? Number(r.color) : null,
      grams: loose(r.grams) ?? 0,
    })),
    parts: v.parts.map((r) => ({ part: Number(r.part), qty: loose(r.qty) ?? 0 })),
    default_pack: v.default_pack ? Number(v.default_pack) : null,
  }
}
