import type { ProductStatus } from '../../api/products'

export const STATUS_LABEL: Record<ProductStatus, string> = {
  on_sale: '판매중',
  developing: '개발중',
  discontinued: '판매중지',
}

export const STATUSES = Object.keys(STATUS_LABEL) as ProductStatus[]
