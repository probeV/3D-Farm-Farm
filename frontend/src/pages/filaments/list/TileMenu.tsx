import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Color } from '../../../api/filaments'
import { totalOf } from '../stock'

// 메뉴에서 여는 창. colorManage = 톱니바퀴 (색상 · 스풀 관리)
export type TileAction = 'purchase' | 'pickOpen' | 'pickFinish' | 'colorManage'

interface Props {
  color: Color
  anchor: HTMLElement // 누른 타일
  onPick: (kind: TileAction) => void
  onClose: () => void
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

// 색상 타일 메뉴: 타일 아래(공간이 없으면 위)에 열림. 바깥 클릭 · Esc · 스크롤로 닫힘 (docs/screens.md 1.4)
// 머리: 색상 칩 · 이름 · 코드 · 스풀 수 + 톱니바퀴(색상 · 스풀 관리, TBD-13) / 아래: 재고 추가 · 사용 중으로 · 사용 완료로
export default function TileMenu({ color, anchor, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const n = color.counts

  // 메뉴 크기를 재야 위치를 정할 수 있어서, 그린 직후(화면에 보이기 전)에 계산
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const r = anchor.getBoundingClientRect()
    const below = r.bottom + menu.offsetHeight + 8 < innerHeight
    setPos({
      left: Math.min(r.left, innerWidth - menu.offsetWidth - 12) + scrollX,
      top: (below ? r.bottom + 6 : r.top - menu.offsetHeight - 6) + scrollY,
    })
  }, [anchor])

  useEffect(() => {
    // 타일을 누른 것은 타일이 직접 처리한다 (같은 타일 = 닫기, 다른 타일 = 그 타일로 열기)
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest('.tile[data-color]')) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, { passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose)
    }
  }, [onClose])

  return createPortal(
    <div className="tile-menu" ref={ref} style={pos ?? { visibility: 'hidden' }}>
      <div className="tile-menu-head" style={{ '--c': color.hex } as CSSProperties}>
        <span className="chip" />
        <strong>{color.name}</strong>
        <button
          type="button"
          className="gear"
          title="색상 · 스풀 관리"
          aria-label="색상 · 스풀 관리"
          onClick={() => onPick('colorManage')}
        >
          <Icon>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </Icon>
        </button>
        <span className="meta">
          <code>{color.hex}</code> · 스풀 {totalOf(n)}개
        </span>
      </div>
      <button type="button" className="act" onClick={() => onPick('purchase')}>
        <Icon>
          <path d="M12 5v14M5 12h14" />
        </Icon>
        재고 추가
        <small />
      </button>
      <button type="button" className="act" disabled={!n.sealed} onClick={() => onPick('pickOpen')}>
        <Icon>
          <path d="M7 5l11 7-11 7z" />
        </Icon>
        사용 중으로
        <small>재고 {n.sealed}</small>
      </button>
      <button type="button" className="act" disabled={!n.open} onClick={() => onPick('pickFinish')}>
        <Icon>
          <path d="M5 12l5 5L19 7" />
        </Icon>
        사용 완료로
        <small>사용 중 {n.open}</small>
      </button>
    </div>,
    document.body,
  )
}
