import type { Expense, ExpenseCategory } from '../../api/expenses'
import type { Part } from '../../api/products'
import Help from '../../components/Help'
import { unitWon, won } from '../../format'
import { qty as qtyText } from '../stock/kinds'
import { emptyRow, nextAverage, parseRows, spoolDiff, splitTotals, type BuyField, type BuyRow } from './buyRows'

// 고를 수 있는 색상 (필라멘트 이름 · 지금 원가 계산표의 스풀 가격 포함)
export interface BuyColor {
  id: number
  name: string
  fil: string // `Bambu Lab › PLA Basic`
  price: number | null // spool_price
}

interface Props {
  category: ExpenseCategory
  field: BuyField
  rows: BuyRow[]
  amount: number | null // 지출 금액 (배송비 포함 총액)
  expense: Expense | null // 고치는 지출 (새 지출이면 null)
  colors: BuyColor[]
  parts: Part[] // 이 분류의 탭 품목만
  error: string | null
  onChange: (rows: BuyRow[]) => void
}

// 지출 창의 구매 항목 (v2 TBD-31 · 33, docs/screens.md 5.3): [색상 · 품목] [수량] [금액] ✕ + 항목 아래 저장하면 바뀌는 것.
// 필라멘트는 스풀(롤 수만큼 생김, 원가는 보유 스풀 평균)로, 부속품 · 포장재 · 소모품은 남은 수량 · 평균 단가(이동평균)로 이어진다.
// 사용한 스풀이 있는 항목은 색상 변경 · 빼기 불가
export default function BuyLines(p: Props) {
  const { category, field, rows, amount, expense, colors, parts, error, onChange } = p
  const filament = field === 'color'
  const partOf = new Map(parts.map((x) => [x.id, x]))
  const parsed = parseRows(rows)
  const totals = splitTotals(category, amount ?? 0, parsed)
  const totalOf = new Map(parsed.map((r, i) => [r.row, totals[i]]))
  const set = (i: number, patch: Partial<BuyRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const fils = [...new Set(colors.map((c) => c.fil))]
  const sortedParts = [...parts].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const usedTotal = rows.reduce((a, r) => a + r.used, 0)

  // 항목 아래: 저장하면 바뀌는 것 (필라멘트면 스풀 수 — 원가 단가는 보유 스풀 평균이라 저절로, 품목이면 남은 수량 · 평균 단가)
  const effect = (r: BuyRow) => {
    const total = totalOf.get(r)
    const q = Number(r.qty)
    if (r.pick == null || total == null || !(q > 0)) return null
    const each = total / q
    if (filament) {
      const d = spoolDiff(r)
      const spool = d > 0 ? `스풀 +${d}개` : d < 0 ? `스풀 −${-d}개` : expense && r.id != null ? '스풀 그대로' : ''
      return (
        <>
          롤당 <b>{won(each)}</b>
          {spool && <> · {d ? <b>{spool}</b> : spool}</>}
        </>
      )
    }
    const part = partOf.get(r.pick)
    const stock = `재고 +${qtyText(q)}${part?.unit ?? ''}`
    // 이미 저장된 항목을 고치면 지난 날짜부터 다시 계산하므로 미리보기 없이
    if (r.id != null) return <span className="hint">{stock} · 평균 단가 다시 계산</span>
    const cur = part?.unit_price ?? null
    return (
      <>
        <b>{stock}</b> · 평균 {cur == null ? '미입력' : unitWon(cur)} →{' '}
        <b>{unitWon(nextAverage(part?.stock ?? 0, cur, q, each))}</b>
      </>
    )
  }

  return (
    <div className="field full buy-box">
      <span>
        구매{category === 'supply' && ' (선택)'}
        <Help
          tip={
            filament
              ? '산 색상과 롤 수. 저장하면 롤 수만큼 스풀이 재고로 생겨요(구매가 = 롤당 금액 — 원가 계산은 보유 스풀 평균이라 저절로 반영). 고치면 바뀐 롤 수만큼만 스풀이 생기거나 지워져요. 금액을 비우면 총액(배송비 포함)을 롤 수대로 나눠요. 같은 색상이 값이 다르면 항목을 나눠 적어요'
              : '산 품목과 수량. 저장하면 재고 관리의 남은 수량이 늘고, 평균 단가(남은 재고와 섞은 값)가 다시 계산돼요 — 원가 계산 · 판매 · 손익에 써요. 한 가지면 금액을 비워도 돼요(총액), 여러 가지면 항목마다 금액을 적어요'
          }
        />
      </span>
      <div className="buy-list">
        {rows.map((r, i) => {
          const part = r.pick != null ? partOf.get(r.pick) : undefined
          const total = totalOf.get(r)
          const eff = effect(r)
          return (
            <div key={r.key} className="buy-row">
              <select
                aria-label={filament ? '색상' : '품목'}
                value={r.pick ?? ''}
                disabled={filament && r.used > 0}
                title={filament && r.used > 0 ? `사용한 스풀 ${r.used}개가 있어 색상을 바꿀 수 없어요` : undefined}
                onChange={(e) => set(i, { pick: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">{filament ? '색상 고르기' : '품목 고르기'}</option>
                {filament
                  ? fils.map((fl) => (
                      <optgroup key={fl} label={fl}>
                        {colors
                          .filter((c) => c.fil === fl)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))
                  : sortedParts.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
              </select>
              <div className="with-suffix">
                <input
                  inputMode="decimal"
                  aria-label="수량"
                  value={r.qty}
                  onChange={(e) => set(i, { qty: e.target.value })}
                />
                <em>{filament ? '롤' : (part?.unit ?? '개')}</em>
              </div>
              <div className="with-suffix">
                <input
                  inputMode="numeric"
                  aria-label="금액"
                  value={r.amount}
                  placeholder={
                    total != null && r.amount === '' ? Math.round(total).toLocaleString('ko-KR') : '나눠 넣기'
                  }
                  onChange={(e) => set(i, { amount: e.target.value })}
                />
                <em>원</em>
              </div>
              <button
                type="button"
                className="icon-btn"
                title={r.used ? `사용한 스풀 ${r.used}개가 있어 뺄 수 없어요` : '이 항목 빼기'}
                aria-label="이 항목 빼기"
                disabled={rows.length < 2 || r.used > 0}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                ✕
              </button>
              {eff && <div className="buy-effect">{eff}</div>}
            </div>
          )
        })}
      </div>
      <div className="buy-foot">
        <button type="button" className="btn small add" onClick={() => onChange([...rows, emptyRow()])}>
          + {filament ? '색상' : '품목'} 추가
        </button>
        {error && <span className="warn-t">{error}</span>}
        {filament && usedTotal > 0 && (
          <span className="hint" title="사용 중 · 사용 완료 스풀은 지출에서 줄이거나 색상을 바꾸거나 뺄 수 없어요">
            사용한 스풀 {usedTotal}개
          </span>
        )}
      </div>
    </div>
  )
}
