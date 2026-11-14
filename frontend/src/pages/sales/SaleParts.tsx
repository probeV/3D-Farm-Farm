import type { Part } from '../../api/products'
import Help from '../../components/Help'
import { qty } from '../stock/kinds'
import { num } from './packLines'
import { partLine, type PartLine } from './partLines'

interface Props {
  lines: PartLine[]
  parts: Part[] // 부속품 (부속품 탭 품목)
  note: string // 줄 아래 안내 (제품이 줄었는데 바꾼 부속품이라 그대로인 것 …)
  onChange: (lines: PartLine[]) => void
}

// 판매 창의 부속품 줄 (v2 STORE): 부속품 · 수량 · (모자라면 !) · ✕. 포장 줄과 같은 모양 (금액 칸 없음 — 원가는 원가 계산표).
// 제품 · 수량을 바꾸면 SaleDialog 가 차이만큼 맞추고, 옵션에 따라 다른 부속품(청축 → 적축)은 여기서 바꾼다.
// 저장하면 부속품 남은 수량에서 빠진다 (서버는 이 줄을 그대로 씀)
export default function SaleParts({ lines, parts, note, onChange }: Props) {
  const sorted = [...parts].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const byId = new Map(parts.map((p) => [p.id, p]))
  const set = (i: number, patch: Partial<PartLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  return (
    <div className="packs sale-parts">
      <div className="packs-head">
        <span>
          부속품
          <Help tip="이 판매로 남은 수량에서 빠지는 부속품. 제품을 고르거나 수량을 바꾸면 제품의 사용 부속품만큼 저절로 바뀌어요. 옵션에 따라 다른 부속품(예: 청축 → 적축)이면 여기서 바꿔요" />
        </span>
        <span className="num">수량</span>
        <span />
        <span />
        <span />
      </div>
      {lines.length ? (
        lines.map((l, i) => {
          const p = l.part ? byId.get(Number(l.part)) : undefined
          const short = p && p.stock < num(l.qty)
          return (
            <div key={l.key} className="pack-row">
              {p || !l.part_name ? (
                <select
                  aria-label="부속품"
                  value={l.part}
                  onChange={(e) => set(i, { part: e.target.value, part_name: '' })}
                >
                  {sorted.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span title="지운 부속품 · 저장할 때 이름">{l.part_name}</span>
              )}
              <div className="with-suffix">
                <input
                  inputMode="decimal"
                  aria-label="수량"
                  value={l.qty}
                  onChange={(e) => set(i, { qty: e.target.value })}
                />
                <em>{p?.unit}</em>
              </div>
              <span>
                {short && (
                  // 남은 수량보다 많이 쓰면 주황 ! (저장은 막지 않음)
                  <span className="help short-ico" tabIndex={0} data-tip={`${qty(p.stock)}${p.unit} 남음`}>
                    !
                  </span>
                )}
              </span>
              <span />
              <button
                type="button"
                className="icon-btn"
                title="이 부속품 빼기"
                aria-label="이 부속품 빼기"
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          )
        })
      ) : (
        <div className="packs-empty">부속품 없음 · 제품을 고르면 그 제품의 사용 부속품으로 채워져요</div>
      )}
      <div className="packs-foot">
        <button
          type="button"
          className="btn small add"
          disabled={!sorted.length}
          onClick={() => onChange([...lines, partLine(sorted[0].id, 1)])}
        >
          + 부속품 추가
        </button>
        {note && <span className="packs-note warn">{note}</span>}
      </div>
    </div>
  )
}
