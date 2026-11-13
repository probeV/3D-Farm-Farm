import type { Part } from '../../api/products'
import LinkBadge from '../../components/LinkBadge'

// 품목 옆 `구매` 버튼: 구매 링크를 새 탭으로 (TBD-20)
export default function BuyLink({ part }: { part: Part }) {
  return <LinkBadge href={part.buy_url} label="구매" title="구매 페이지 열기" />
}
