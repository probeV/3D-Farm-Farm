const GROUP = 5

// 페이지 넘김: `‹ ›` 한 페이지, `« »` 5페이지 묶음 (PRD INV-06). 1페이지뿐이면 그리지 않음
export default function Pager({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
}) {
  if (pages <= 1) return null
  const start = Math.floor((page - 1) / GROUP) * GROUP + 1
  const end = Math.min(start + GROUP - 1, pages)
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const btn = (label: string | number, to: number, disabled: boolean, active = false) => (
    <button
      key={`${label}-${to}`}
      type="button"
      className={active ? 'page-btn active' : 'page-btn'}
      disabled={disabled}
      onClick={() => onPage(to)}
    >
      {label}
    </button>
  )

  return (
    <div className="pager">
      {btn('«', Math.max(1, start - GROUP), start === 1)}
      {btn('‹', page - 1, page === 1)}
      {nums.map((p) => btn(p, p, false, p === page))}
      {btn('›', page + 1, page === pages)}
      {btn('»', end + 1, end === pages)}
    </div>
  )
}

export const PAGE_SIZE = 10
