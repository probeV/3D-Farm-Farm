import type { PackSet, Part } from '../../api/products'
import Help from '../../components/Help'
import { unitWon, won } from '../../format'
import { qty } from '../stock/kinds'
import { setCost } from '../stock/partList'
import { addSet, num, packAmount, packLine, type PackLine } from './packLines'

interface Props {
  lines: PackLine[]
  packs: Part[] // 포장재 (포장 탭 품목)
  sets: PackSet[]
  note: string // 줄 아래 안내 (첫 제품의 기본 포장으로 채웠어요 …)
  onChange: (lines: PackLine[]) => void
}

// 판매 창의 포장 줄 (SALE-06, docs/screens.md 판매): 포장재 · 수량 · (모자라면 !) · 금액 · ✕.
// `+ 포장 세트 더하기` 는 세트 구성을 지금 줄에 더하고, `+ 포장재 추가` 는 한 줄. 저장하면 포장재 남은 수량에서 빠진다
export default function SalePacks({ lines, packs, sets, note, onChange }: Props) {
  const sorted = [...packs].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const byId = new Map(packs.map((p) => [p.id, p]))
  const set = (i: number, patch: Partial<PackLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const total = lines.reduce((a, l) => a + packAmount(l), 0)

  return (
    <div className="packs">
      <div className="packs-head">
        <span>
          포장
          <Help tip="주문 하나에 쓴 포장재. 포장 세트를 고르면 그 구성이 지금 줄에 더해지고(같은 포장재는 수량 합침), 줄마다 바꾸거나 뺄 수 있어요. 저장하면 포장재 남은 수량에서 빠져요" />
        </span>
        <span className="num">수량</span>
        <span />
        <span className="num">금액</span>
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
                  aria-label="포장재"
                  value={l.part}
                  onChange={(e) => {
                    const x = byId.get(Number(e.target.value))
                    if (x) set(i, { part: String(x.id), part_name: '', unit_price: x.unit_price })
                  }}
                >
                  {sorted.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.unit_price == null ? '가격 미입력' : `${unitWon(x.unit_price)}/${x.unit}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span title="지운 포장재 · 팔 때 이름">{l.part_name}</span>
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
              <span className="amt">{won(packAmount(l))}</span>
              <button
                type="button"
                className="icon-btn"
                title="이 포장재 빼기"
                aria-label="이 포장재 빼기"
                onClick={() => onChange(lines.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          )
        })
      ) : (
        <div className="packs-empty">포장 없음 · 직접 전달 등 포장하지 않은 주문</div>
      )}
      <div className="packs-foot">
        <select
          aria-label="포장 세트 더하기"
          value=""
          disabled={!sets.length}
          onChange={(e) => {
            const s = sets.find((x) => String(x.id) === e.target.value)
            if (s) onChange(addSet(lines, s, byId))
          }}
        >
          <option value="">+ 포장 세트 더하기…</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {won(setCost(s, byId))}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn small add"
          disabled={!sorted.length}
          onClick={() => onChange([...lines, packLine(sorted[0])])}
        >
          + 포장재 추가
        </button>
        {note && <span className="packs-note auto">{note}</span>}
        <div className="spacer" />
        <span className="hint">포장비 {won(total)}</span>
      </div>
    </div>
  )
}
