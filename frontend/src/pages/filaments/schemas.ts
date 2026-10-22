// 필라멘트 화면 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/filaments/serializers.py
import { z } from 'zod'
import { date, decimal, intRange, money, selectedId, text } from '../../validation'

// ---------------------------------------------------------------- 회사 · 재질 · 필라멘트 · 색상
// 이름 중복처럼 DB 를 봐야 아는 것은 서버만 검사한다 (2차)

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// 회사 (PRD FIL-01 · FIL-01a). 서버: BrandSerializer, Brand.name max_length=50, 로고 png · jpg · webp 5MB
export const brandSchema = z.object({
  name: text(50),
  logo: z
    .instanceof(File)
    .refine((f) => LOGO_TYPES.includes(f.type), 'png, jpg, webp 이미지만 올릴 수 있어요')
    .refine((f) => f.size <= 5 * 1024 * 1024, '이미지는 5MB 까지 올릴 수 있어요')
    .nullable(), // 새로 고른 파일. 없으면 null
})

// 재질 (PRD FIL-02). 서버: Material.name max_length=50
export const materialSchema = z.object({ name: text(50) })

// 필라멘트 (PRD FIL-03). 서버: FilamentSerializer, spool_g = DecimalField(max_digits=7, decimal_places=1, min 1)
export const filamentSchema = z.object({
  material: selectedId('재질을 고르세요'),
  series: text(50, false),
  price: money,
  spool_g: decimal(1, 999_999.9, 1),
})

// 색상 코드: "F5F5F5" · "#f5f5f5" 모두 받아 "#F5F5F5" 로 (PRD FIL-05). 서버: normalize_hex · validate_hex
export const hex = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, '# 과 16진수 6자리로 입력하세요')
  .transform((v) => '#' + v.replace('#', '').toUpperCase())

// 색상 (PRD FIL-04 · FIL-06). 서버: ColorSerializer, Color.name max_length=50. 가격을 비우면 필라멘트 가격
export const colorSchema = z.object({ name: text(50), hex, price: money })

// ---------------------------------------------------------------- 스풀

// "11, 15, 20-25" → [11, 15, 20, 21, …, 25]. S00011 처럼 코드로 적어도 됨. 비우면 [] (전부 자동)
const codeNos = z.string().transform((text, ctx) => {
  const fail = (message: string) => {
    ctx.addIssue({ code: 'custom', message })
    return z.NEVER
  }
  const nos: number[] = []
  for (const part of text.split(',').map((s) => s.trim())) {
    if (!part) continue
    const m = part.match(/^S?(\d+)(?:\s*-\s*S?(\d+))?$/i)
    if (!m) return fail(`번호 형식을 확인하세요: ${part}`)
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : from
    if (from < 1 || to < from) return fail(`범위를 확인하세요: ${part}`)
    if (nos.length + (to - from + 1) > 100) return fail('번호는 100개까지 지정할 수 있어요')
    for (let n = from; n <= to; n++) nos.push(n)
  }
  return nos
})

// 재고 추가 (PRD INV-02). 서버: PurchaseSerializer — 이미 있는 번호는 서버만 알 수 있어서 2차에서 걸린다
export const purchaseSchema = z
  .object({
    quantity: intRange(1, 100),
    purchased_at: date,
    price: money, // 비우면(null) 보내지 않음 → 서버가 색상 가격으로
    code_nos: codeNos,
  })
  .refine((v) => v.code_nos.length <= v.quantity, {
    path: ['code_nos'],
    message: '지정한 번호가 수량보다 많아요',
  })
