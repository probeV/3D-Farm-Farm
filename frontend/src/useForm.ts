// 폼 공통 흐름 (docs/architecture.md 3.1)
//   입력 → 1차 검사(Zod 스키마) → 통과하면 저장 → 서버 400 은 칸별 오류(2차), 그 밖의 오류(409 등)는 알림
import { useState } from 'react'
import type { z } from 'zod'
import { fieldErrorsOf } from './api/client'
import { useToast } from './components/useToast'
import { fieldErrors, validate } from './validation'

// values: 입력칸 값 그대로 (글자 · 파일). 숫자 변환 · 검사는 스키마가 한다
export function useForm<V extends Record<string, unknown>, S extends z.ZodType>(schema: S, initial: V) {
  const toast = useToast()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // 한 번 오류가 난 뒤에는 입력할 때마다 다시 검사해서, 고치면 바로 사라지게 한다
  // 여러 칸을 함께 바꿀 때는 update 로 한 번에 (change 를 연달아 부르면 앞의 변경이 덮임)
  const update = (patch: Partial<V>) => {
    const next = { ...values, ...patch }
    setValues(next)
    if (Object.keys(errors).length) setErrors(validate(schema, next))
  }
  const change = <K extends keyof V>(field: K, value: V[K]) => update({ [field]: value } as unknown as Partial<V>)

  // 검사를 통과한 값(스키마가 변환한 값)으로 save 를 부른다
  const submit = async (save: (data: z.output<S>) => Promise<unknown>) => {
    const r = schema.safeParse(values)
    if (!r.success) return setErrors(fieldErrors(r.error))
    setBusy(true)
    try {
      await save(r.data)
    } catch (e) {
      const found = fieldErrorsOf(e, Object.keys(values))
      setErrors(found)
      if (!Object.keys(found).length) toast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return { values, errors, busy, change, update, submit }
}
