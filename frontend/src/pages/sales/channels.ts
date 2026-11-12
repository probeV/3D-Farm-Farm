import type { SaleChannel } from '../../api/sales'

// 판매처 (고정 3개, 서버: sales/models.py SaleChannel)
export const CHANNELS: { key: SaleChannel; label: string }[] = [
  { key: 'store', label: '스마트스토어' },
  { key: 'direct', label: '직접 판매' },
  { key: 'etc', label: '기타' },
]

export const channelLabel = (key: SaleChannel) => CHANNELS.find((c) => c.key === key)!.label
