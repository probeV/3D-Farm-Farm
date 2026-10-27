import type { Part } from '../../api/products'

// 품목 옆 `구매` 버튼: 구매 링크를 새 탭으로 (TBD-20). 행을 눌러 여는 수정 창과 겹치지 않게 클릭을 막는다
export default function BuyLink({ part }: { part: Part }) {
  if (!part.buy_url) return null
  return (
    <a
      className="buy-link"
      href={part.buy_url}
      target="_blank"
      rel="noopener noreferrer"
      title={`구매 페이지 열기 (새 탭) · ${part.buy_url}`}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </svg>
      구매
    </a>
  )
}
