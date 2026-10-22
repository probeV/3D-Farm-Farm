import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Color } from '../../../api/filaments'
import Swatch from '../../../components/Swatch'
import { totalOf } from '../stock'

// 메뉴에서 여는 창
export type TileAction = 'purchase' | 'pickOpen' | 'pickFinish' | 'adjust' | 'editColor'

interface Props {
  color: Color
  anchor: HTMLElement // 누른 타일
  onPick: (kind: TileAction) => void
  onClose: () => void
}

// 색상 타일 메뉴: 타일 아래(공간이 없으면 위)에 열림. 바깥 클릭 · Esc · 스크롤로 닫힘 (docs/screens.md 1.4)
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
      <div className="tile-menu-head">
        <Swatch hex={color.hex} />
        <strong>{color.name}</strong>
        <code>{color.hex}</code>
      </div>
      <button type="button" onClick={() => onPick('purchase')}>
        + 재고 추가
      </button>
      <button type="button" disabled={!n.sealed} onClick={() => onPick('pickOpen')}>
        사용 중으로 <small>재고 {n.sealed}</small>
      </button>
      <button type="button" disabled={!n.open} onClick={() => onPick('pickFinish')}>
        사용 완료로 <small>사용 중 {n.open}</small>
      </button>
      <button type="button" disabled={totalOf(n) === 0} onClick={() => onPick('adjust')}>
        ⚙ 스풀 조정
      </button>
      <hr />
      <button type="button" onClick={() => onPick('editColor')}>
        색상 수정
      </button>
    </div>,
    document.body,
  )
}
