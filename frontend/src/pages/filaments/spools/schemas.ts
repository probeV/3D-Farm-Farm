// 스풀 폼 검증 스키마. 공통 규칙은 src/validation.ts, 서버 규칙은 backend/filaments/serializers.py
import { z } from 'zod'
import { date, intRange, money } from '../../../validation'

// 재고 추가 (PRD INV-02). 서버: PurchaseSerializer. 번호는 항상 다음 번호부터 (번호 지정 없음, TBD-33)
export const purchaseSchema = z.object({
  quantity: intRange(1, 100),
  purchased_at: date,
  price: money, // 비우면(null) 보내지 않음 → 서버가 색상 가격으로
})
