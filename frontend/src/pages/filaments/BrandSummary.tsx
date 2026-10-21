import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import type { Brand, ByStatus } from '../../api/filaments'
import { kgText } from '../../format'
import BrandLogo from './BrandLogo'
import { heldOf, totalOf } from './stock'

export interface BrandKg {
  brand: Brand
  kg: ByStatus
}

// 카드 크기 고정. 한 줄에 다 들어가면 1줄, 넘치면 2줄로 나누고 가로로 슬라이드 (PRD SUM-06)
const CARD_W = 260
const CARD_GAP = 12

interface Props {
  items: BrandKg[]
  selected: number | null
  onSelect: (brandId: number) => void
}

export default function BrandSummary({ items, selected, onSelect }: Props) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [edge, setEdge] = useState({ prev: false, next: false })

  // 넘길 수 있을 때만 좌우 버튼
  const updateEdge = () => {
    const box = boxRef.current
    if (!box) return
    setEdge({ prev: box.scrollLeft > 2, next: box.scrollLeft + box.clientWidth < box.scrollWidth - 2 })
  }

  useLayoutEffect(() => {
    const el = sliderRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const perRow = Math.max(1, Math.floor((width + CARD_GAP) / (CARD_W + CARD_GAP)))
  const half = Math.ceil(items.length / 2)
  const rows = items.length <= perRow ? [items] : [items.slice(0, half), items.slice(half)]

  useLayoutEffect(updateEdge, [width, items.length])

  // 세로 휠도 좌우로 (넘길 공간이 있고 끝이 아닐 때만). 기본 동작을 막아야 해서 passive: false 로 직접 등록
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || box.scrollWidth <= box.clientWidth) return
      const atEdge =
        (e.deltaY < 0 && box.scrollLeft <= 0) ||
        (e.deltaY > 0 && box.scrollLeft + box.clientWidth >= box.scrollWidth - 1)
      if (atEdge) return
      e.preventDefault()
      box.style.scrollBehavior = 'auto'
      box.scrollLeft += e.deltaY
      box.style.scrollBehavior = ''
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [])

  // 마우스로 끌어서 좌우로 넘기기. 끈 경우에는 카드 클릭으로 처리하지 않음
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false })
  const [dragging, setDragging] = useState(false)

  // 포인터는 실제로 끌기 시작할 때만 잡는다. 누르자마자 잡으면 클릭이 카드가 아닌 슬라이더로 간다
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    drag.current = { down: true, startX: e.clientX, startLeft: e.currentTarget.scrollLeft, moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget
    if (!drag.current.down || !(e.buttons & 1)) return
    const dx = e.clientX - drag.current.startX
    if (!drag.current.moved && Math.abs(dx) > 4) {
      drag.current.moved = true
      box.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    if (drag.current.moved) box.scrollLeft = drag.current.startLeft - dx
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current.down = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }
  const onClickCapture = (e: MouseEvent) => {
    if (!drag.current.moved) return
    e.stopPropagation()
    e.preventDefault()
    drag.current.moved = false
  }

  const slide = (dir: number) => {
    const box = boxRef.current
    if (box) box.scrollLeft += dir * (box.clientWidth - CARD_W / 2)
  }

  return (
    <div className="brand-slider" ref={sliderRef}>
      <button type="button" className="slide-btn prev" title="이전" hidden={!edge.prev} onClick={() => slide(-1)}>
        ‹
      </button>
      <div
        className={dragging ? 'brand-rows dragging' : 'brand-rows'}
        ref={boxRef}
        onScroll={updateEdge}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {rows.map((row, i) => (
          <div className="brand-row" key={i}>
            {row.map((x) => (
              <BrandCard key={x.brand.id} item={x} active={x.brand.id === selected} onSelect={onSelect} />
            ))}
          </div>
        ))}
      </div>
      <button type="button" className="slide-btn next" title="다음" hidden={!edge.next} onClick={() => slide(1)}>
        ›
      </button>
    </div>
  )
}

function BrandCard({ item, active, onSelect }: { item: BrandKg; active: boolean; onSelect: (id: number) => void }) {
  const { brand, kg } = item
  const total = totalOf(kg) || 1
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSelect(brand.id)
  }

  return (
    <div
      className={active ? 'brand-card active' : 'brand-card'}
      role="button"
      tabIndex={0}
      title={`필라멘트 목록을 ${brand.name}만 보기`}
      onClick={() => onSelect(brand.id)}
      onKeyDown={onKeyDown}
    >
      <div className="brand-card-head">
        <BrandLogo brand={brand} size="md" />
        <strong className="bname">{brand.name}</strong>
        <div className="held" title="재고 + 사용 중">
          <b>
            {kgText(heldOf(kg))}
            <span>kg</span>
          </b>
        </div>
      </div>
      <div className="bar">
        <span className="s" style={{ width: pct(kg.sealed) }} />
        <span className="o" style={{ width: pct(kg.open) }} />
        <span className="e" style={{ width: pct(kg.empty) }} />
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--bar-sealed)' }} />
          재고 {kgText(kg.sealed)}kg
        </span>
        <span>
          <i style={{ background: 'var(--bar-open)' }} />
          사용 중 {kgText(kg.open)}kg
        </span>
        <span>
          <i style={{ background: 'var(--bar-empty)' }} />
          사용 완료 {kgText(kg.empty)}kg
        </span>
      </div>
    </div>
  )
}
