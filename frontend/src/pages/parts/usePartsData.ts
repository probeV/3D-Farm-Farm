// 부자재 화면 데이터: 부자재 + 제품(부자재 줄)을 함께 불러와 부자재별 사용하는 제품까지 모아 둔다
// 목록 · 부자재 관리 창이 같이 쓴다 (같은 쿼리라 한 번만 불러옴)
import { useMemo } from 'react'
import { useParts, useProducts } from '../../api/products'
import { usagesByPart } from './partList'

export function usePartsData() {
  const parts = useParts()
  const products = useProducts()
  const queries = [parts, products]
  const usages = useMemo(() => products.data && usagesByPart(products.data), [products.data])

  return {
    error: queries.find((q) => q.isError)?.error ?? null,
    retry: () => queries.forEach((q) => q.refetch()),
    data:
      parts.data && products.data && usages
        ? { parts: parts.data, products: products.data, usagesOf: (id: number) => usages.get(id) ?? [] }
        : null,
  }
}
