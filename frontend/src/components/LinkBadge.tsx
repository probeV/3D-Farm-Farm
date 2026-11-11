// 이름 옆 작은 링크 버튼 (부자재 `구매`, 지출 `주문`): 새 탭으로 연다.
// 행을 눌러 여는 수정 창과 겹치지 않게 클릭을 막는다
export default function LinkBadge({ href, label, title }: { href: string; label: string; title: string }) {
  if (!href) return null
  return (
    <a
      className="buy-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${title} (새 탭) · ${href}`}
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
      {label}
    </a>
  )
}
