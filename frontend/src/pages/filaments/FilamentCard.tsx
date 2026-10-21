import type { CSSProperties } from 'react'
import type { Brand, Color, Filament } from '../../api/filaments'
import { kgText, won } from '../../format'
import BrandLogo from './BrandLogo'
import { STATUS_LABEL, colorState, heldOf, totalOf } from './stock'

interface Props {
  filament: Filament
  brand: Brand | undefined
  colors: Color[] // 검색에 맞는 색상만
  showAdd: boolean // 색상 이름으로만 걸린 경우에는 `+ 색상` 타일을 숨김
}

// 필라멘트 묶음: 제목 타일 → 색상 타일들 → `+ 색상` 타일 (PRD FIL-10)
export default function FilamentCard({ filament: f, brand, colors, showAdd }: Props) {
  const avg = f.avg_held_price != null ? ` · 보유 스풀 평균 ${won(f.avg_held_price)}` : ''

  return (
    <section className="fil-card">
      <div className="tiles">
        <div className="fil-head" title={f.display_name + avg}>
          <BrandLogo brand={brand ?? { name: f.brand_name, logo: null }} />
          <div className="fil-brand">{f.brand_name}</div>
          <div className="fil-title">{f.series ? `${f.material_name} ${f.series}` : f.material_name}</div>
          <div className={f.price == null ? 'fil-meta none' : 'fil-meta'}>
            {f.price == null ? '가격 미입력' : `${won(f.price)} / ${kgText(f.spool_g / 1000)}kg`}
          </div>
        </div>
        {colors.map((c) => (
          <ColorTile key={c.id} color={c} spoolG={f.spool_g} />
        ))}
        {showAdd && (
          <button type="button" className="tile add-tile" title={`${f.display_name} 에 색상 추가`}>
            <span>+</span>색상
          </button>
        )}
      </div>
    </section>
  )
}

// 색상 타일: 왼쪽 색 선 · 이름 · 상태 배지 · 보유 kg · 비율 막대 · 상태별 개수
function ColorTile({ color: c, spoolG }: { color: Color; spoolG: number }) {
  const n = c.counts
  const state = colorState(c)
  const parts = [
    ['s', n.sealed],
    ['o', n.open],
    ['e', n.empty],
  ] as const

  return (
    <button type="button" className="tile" title={c.name} style={{ '--c': c.hex } as CSSProperties}>
      <span className="tile-head">
        <span className="tname">{c.name}</span>
        {state === 'usedUp' && <span className="badge bad">소진</span>}
        {state === 'noStock' && <span className="badge warn">재고 없음</span>}
      </span>
      <span className="tile-sub">{c.price != null && `색상 가격 ${won(c.price)}`}</span>
      <span className="tile-kg" title="재고 + 사용 중">
        {kgText((heldOf(n) * spoolG) / 1000)}
        <small>kg</small>
      </span>
      {/* 스풀이 하나도 없으면 가는 선만 */}
      <span className="bar mini">
        {totalOf(n) === 0 ? (
          <span className="e" style={{ flex: '1 1 0' }} />
        ) : (
          parts.filter(([, v]) => v > 0).map(([k, v]) => <span key={k} className={k} style={{ flex: `${v} 1 0` }} />)
        )}
      </span>
      <span className="tile-counts">
        <span>
          <b>{n.sealed}</b>
          {STATUS_LABEL.sealed}
        </span>
        <span className={n.open ? 'open' : ''}>
          <b>{n.open}</b>
          {STATUS_LABEL.open}
        </span>
        <span className="muted">
          <b>{n.empty}</b>
          {STATUS_LABEL.empty}
        </span>
      </span>
    </button>
  )
}
