// 입력 검증 공통 (1차). 서버 시리얼라이저가 최종 판정(2차)이고, 규칙은 서버와 같게 맞춘다.
// 모든 폼은 같은 순서로 검사한다: 입력칸 글자 → 스키마.safeParse → 성공하면 서버로, 실패하면 오류 표시
// (브라우저 기본 검사는 쓰지 않음 — Dialog 의 form 은 noValidate. 표시 규칙은 docs/architecture.md)
import { z } from 'zod'

// 입력칸 글자 → 숫자. 빈칸 → null, 숫자가 아니면 NaN. 천 단위 쉼표는 허용 ("13,850")
// 숫자 칸은 type="text" + inputMode="numeric" 로 둔다 (type="number" 는 "-" 같은 글자를 빈칸으로 바꿔 넘겨서 구분이 안 됨)
function toNumber(v: unknown) {
  if (typeof v !== 'string') return v
  const text = v.trim().replace(/,/g, '')
  return text === '' ? null : Number(text)
}

const number = z.number({ error: (issue) => (issue.input == null ? '입력하세요' : '숫자로 입력하세요') })

// 금액(원): 비우면 미입력(null), 값이 있으면 0 이상의 정수
// 서버: MONEY = DecimalField(max_digits=10, decimal_places=0, MinValueValidator(0)) — filaments/models.py
export const money = z.preprocess(
  toNumber,
  number
    .int('원 단위 정수로 입력하세요')
    .min(0, '0 이상으로 입력하세요')
    .max(9_999_999_999, '금액이 너무 커요')
    .nullable(),
)

// 정수 범위 (예: 수량 1~100). 비우면 오류
export const intRange = (min: number, max: number) =>
  z.preprocess(
    toNumber,
    number.int('정수로 입력하세요').min(min, `${min} 이상으로 입력하세요`).max(max, `${max} 이하로 입력하세요`),
  )

// 소수 자리 제한이 있는 수 (예: 스풀 무게 1~999999.9 g, 소수 첫째 자리까지). 비우면 오류
export const decimal = (min: number, max: number, places: number) =>
  z.preprocess(
    toNumber,
    number
      .min(min, `${min} 이상으로 입력하세요`)
      .max(max, `${max} 이하로 입력하세요`)
      // 0.1 같은 소수는 2진수로 정확히 안 떨어져서 오차를 두고 비교
      .refine((v) => {
        const scaled = v * 10 ** places
        return Math.abs(scaled - Math.round(scaled)) < 1e-6
      }, `소수 ${places}자리까지 입력하세요`),
  )

// 날짜 "2026-10-21" (type="date" 입력칸이 주는 모양). 비우면 오류
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 입력하세요')

// 글자: 앞뒤 공백을 지우고 max 자까지. required 면 비우면 오류 (서버: CharField(max_length))
export const text = (max: number, required = true) => {
  const s = z.string().trim().max(max, `${max}자까지 입력할 수 있어요`)
  return required ? s.min(1, '입력하세요') : s
}

// 선택 상자에서 고른 id ("3" → 3). 고르지 않으면 오류
export const selectedId = (message: string) =>
  z
    .string()
    .regex(/^\d+$/, message)
    .transform((v) => Number(v))

// 검사 실패 → 칸별 첫 메시지 { quantity: '1 이상으로 입력하세요', ... }
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) out[String(issue.path[0] ?? '')] ??= issue.message
  return out
}

// 폼 전체 검사 → 칸별 오류 (통과하면 빈 객체). 입력할 때마다 오류를 다시 계산할 때 사용
export function validate(schema: z.ZodType, values: unknown): Record<string, string> {
  const r = schema.safeParse(values)
  return r.success ? {} : fieldErrors(r.error)
}
