import type { Expense, ExpenseCategory } from '../../api/expenses'
import type { Part } from '../../api/products'
import Help from '../../components/Help'
import { unitWon, won } from '../../format'
import { qty as qtyText } from '../stock/kinds'
import { emptyRow, isLatest, parseRows, splitTotals, type BuyField, type BuyRow } from './buyRows'

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
  date: string
  expense: Expense | null // 고치는 지출 (최근 구매인지 볼 때 자기 자신 제외)
  all: Expense[]
  colors: BuyColor[]
  parts: Part[] // 이 분류의 탭 품목만
  error: string | null
  onChange: (rows: BuyRow[]) => void
}

// 지출 창의 구매 줄 (v2 TBD-31, docs/screens.md 5.3): [색상 · 품목] [수량] [금액] ✕ + 줄 아래 저장하면 바뀌는 것.
// 필라멘트는 스풀 구매가 · 색상 가격으로, 부속품 · 포장재 · 소모품은 남은 수량 · 묶음 가격으로 이어진다
export default function BuyLines(p: Props) {
  const { category, field, rows, amount, date, expense, all, colors, parts, error, onChange } = p
  const filament = field === 'color'
  const colorOf = new Map(colors.map((c) => [c.id, c]))
  const partOf = new Map(parts.map((x) => [x.id, x]))
  const parsed = parseRows(rows)
  const totals = splitTotals(category, amount ?? 0, parsed)
  const totalOf = new Map(parsed.map((r, i) => [r.row, totals[i]]))
  const set = (i: number, patch: Partial<BuyRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const fils = [...new Set(colors.map((c) => c.fil))]
  const sortedParts = [...parts].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const spoolsTotal = rows.reduce((a, r) => a + r.spools, 0)
  const qtyTotal = parsed.reduce((a, r) => a + (r.qty || 0), 0)

  // 줄 아래: 저장하면 바뀌는 것 (최근 구매면 단가, 품목이면 남은 수량)
  const effect = (r: BuyRow) => {
    const total = totalOf.get(r)
    const q = Number(r.qty)
    if (r.pick == null || total == null || !(q > 0)) return null
    const each = total / q
    const latest = isLatest(all, expense, field, r.pick, date)
    if (filament) {
      const cur = colorOf.get(r.pick)?.price ?? null
      return latest ? (
        <>
          통당 <b>{won(each)}</b> · 단가 {cur == null ? '미입력' : won(cur)} → <b>{won(each)}</b>
        </>
      ) : (
        <span className="hint">통당 {won(each)} · 최근 구매 아님 · 단가 그대로</span>
      )
    }
    const part = partOf.get(r.pick)
    const stock = `재고 +${qtyText(q)}${part?.unit ?? ''}`
    return latest ? (
      <>
        <b>{stock}</b> · 단가 {unitWon(part?.unit_price)} → <b>{unitWon(each)}</b>
      </>
    ) : (
      <span className="hint">{stock} · 최근 구매 아님 · 단가 그대로</span>
    )
  }

  return (
    <div className="field full buy-box">
      <span>
        구매{category === 'supply' && ' (선택)'}
        <Help
          tip={
            filament
              ? '산 색상과 통 수. 금액을 비우면 총액(배송비 포함)을 통 수대로 나눠요. 재고 추가에서 이 주문을 고르면 스풀 구매가 · 구매일이 들어가고, 최근 구매면 색상 가격이 통당 금액으로 바뀌어요'
              : '산 품목과 수량. 저장하면 재고 관리의 남은 수량이 늘고, 최근 구매면 묶음 가격 · 수량이 이 값으로 바뀌어요. 한 가지면 금액을 비워도 돼요(총액), 여러 가지면 줄마다 금액을 적어요'
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
                disabled={filament && r.spools > 0}
                title={
                  filament && r.spools > 0 ? `스풀 ${r.spools}통을 이미 등록해서 색상을 바꿀 수 없어요` : undefined
                }
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
                <em>{filament ? '통' : (part?.unit ?? '개')}</em>
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
                title="이 줄 빼기"
                aria-label="이 줄 빼기"
                disabled={rows.length < 2}
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
        {filament && expense && (
          <span className="hint">
            스풀 등록 {spoolsTotal} / {qtyTotal}통
          </span>
        )}
      </div>
    </div>
  )
}
