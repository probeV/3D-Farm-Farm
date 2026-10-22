import type { ProductStatus } from '../../api/products'
import { STATUS_LABEL } from './status'

// 상태 배지. 판매중은 배지 없음 (개발중 파랑 · 판매중지 회색)
export default function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'on_sale') return null
  return <span className={status === 'developing' ? 'badge info' : 'badge'}>{STATUS_LABEL[status]}</span>
}
