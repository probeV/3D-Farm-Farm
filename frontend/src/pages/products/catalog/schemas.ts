// 카테고리 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/products/serializers.py
// 카테고리 이름 중복은 서버만 검사한다 (2차). 세부 분류 이름 겹침은 한 창 안에서 보이므로 여기서도 검사
import { z } from 'zod'
import { text } from '../../../validation'

// 서버: Category.name · Subcategory.name max_length=50, 세부 분류 이름은 카테고리 안에서 중복 불가
export const categorySchema = z.object({
  name: text(50),
  subs: z
    .array(z.object({ id: z.number().nullable(), name: text(50, false) }))
    .superRefine((subs, ctx) => {
      const seen = new Set<string>()
      subs.forEach((s, i) => {
        if (s.name === '') {
          // 기존 세부 분류는 이름을 비울 수 없음 (빼려면 ✕). 새 줄을 비우면 저장할 때 버린다
          if (s.id != null) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: '이름을 입력하세요' })
          return
        }
        if (seen.has(s.name)) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: '이름이 겹쳐요' })
        seen.add(s.name)
      })
    })
    .transform((subs) => subs.filter((s) => s.name !== '')),
})
