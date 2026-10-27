// 제품 추가 · 수정 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/products/serializers.py
// No. 중복 · 세부 분류와 카테고리 짝 · 색상과 필라멘트 짝은 서버도 검사한다 (2차)
import { z } from 'zod'
import { decimal, money, optionalInt, selectedId, text } from '../../../validation'

// 선택 상자 값: 빈칸 → null ("미분류" · "세부 분류 없음" · "색상 선택 안 함"), "3" → 3
const optionalId = z.string().transform((v) => (v === '' ? null : Number(v)))

// 줄의 사용량 · 수량: 비우면 0 (입력 경고는 원가 계산이 띄움)
const lineAmount = (max: number, places: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? '0' : v), decimal(0, max, places))

// 서버: Product — no PositiveIntegerField(1 이상), name max_length=100, print_minutes PositiveIntegerField,
//       ProductFilament.grams DecimalField(max_digits=8, decimal_places=2), ProductPart.qty (max_digits=10, decimal_places=2)
export const productSchema = z
  .object({
    no: optionalInt(1, 2_147_483_647), // 비우면 서버가 다음 번호
    name: text(100),
    category: optionalId,
    subcategory: optionalId,
    status: z.enum(['on_sale', 'developing', 'discontinued']),
    hours: optionalInt(0, 9999),
    minutes: optionalInt(0, 59),
    sale_price: money,
    note: z.string(),
    filaments: z.array(
      z.object({ filament: selectedId('필라멘트를 고르세요'), color: optionalId, grams: lineAmount(999_999.99, 2) }),
    ),
    parts: z.array(z.object({ part: selectedId('부자재를 고르세요'), qty: lineAmount(99_999_999.99, 2) })),
  })
  // 출력 시간: 시 + 분 → 분. 둘 다 비우면 미입력(null)
  .transform(({ hours, minutes, ...rest }) => ({
    ...rest,
    print_minutes: hours == null && minutes == null ? null : (hours ?? 0) * 60 + (minutes ?? 0),
  }))
