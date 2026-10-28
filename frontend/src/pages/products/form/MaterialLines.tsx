import type { Filament } from '../../../api/filaments'
import type { Part } from '../../../api/products'
import Swatch from '../../../components/Swatch'
import { gramsText, won } from '../../../format'
import { filamentAmount, filamentUnitText, partAmount, partUnitText, type Catalog } from '../cost'
import { newFilamentLine, newKey, previewOf, type FilamentLine, type PartLine, type Values } from './draft'

interface Props {
  values: Values
  errors: Record<string, string>
  catalog: Catalog
  filaments: Filament[]
  parts: Part[]
  onPickFrom: () => void // `+ 다른 제품에서`: 고르는 창은 제품 창이 연다 (form 안에 form 이 들어가지 않도록)
  filamentTotal: number
  partTotal: number
  onFilaments: (rows: FilamentLine[]) => void
  onParts: (rows: PartLine[]) => void
}

// 줄마다 첫 오류 ("filaments.1.grams" → 그 줄 아래 빨간 글씨)
const lineError = (errors: Record<string, string>, kind: string, i: number) =>
  Object.entries(errors).find(([k]) => k.startsWith(`${kind}.${i}.`))?.[1]

// 사용 필라멘트 · 부자재 표 (docs/screens.md 2.5): 한 항목 = 한 줄, 끝에 그 줄 금액 (단가는 금액에 마우스를 올리면)
export default function MaterialLines(props: Props) {
  const { values, errors, catalog, filaments, parts, filamentTotal, partTotal, onFilaments, onParts, onPickFrom } =
    props
  const preview = previewOf(values)
  const gramsSum = preview.filaments.reduce((sum, r) => sum + r.grams, 0)

  const setFilament = (i: number, patch: Partial<FilamentLine>) =>
    onFilaments(values.filaments.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const setPart = (i: number, patch: Partial<PartLine>) =>
    onParts(values.parts.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <>
      <div className="lines">
        <div className="lines-head">
          <h4>
            사용 필라멘트<small>1개 기준</small>
          </h4>
        </div>
        {!filaments.length ? (
          <div className="none">등록된 필라멘트가 없어요. 필라멘트 화면에서 먼저 추가하세요.</div>
        ) : (
          <div className="mat">
            {values.filaments.length > 0 && (
              <div className="mat-head">
                <span>필라멘트</span>
                <span>색상</span>
                <span>사용량</span>
                <span className="r">금액</span>
                <span />
              </div>
            )}
            {values.filaments.map((r, i) => {
              const filament = catalog.filaments.get(Number(r.filament))
              const color = filament?.colors.find((c) => String(c.id) === r.color)
              const amount = filamentAmount(catalog, preview.filaments[i])
              const error = lineError(errors, 'filaments', i)
              return (
                <div key={r.key}>
                  <div className={amount == null ? 'mat-row missing' : 'mat-row'}>
                    {/* 필라멘트를 바꾸면 색상은 "색상 선택 안 함" 으로 */}
                    <select
                      value={r.filament}
                      onChange={(e) => setFilament(i, { filament: e.target.value, color: '' })}
                    >
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.display_name}
                        </option>
                      ))}
                    </select>
                    <div className="color-pick">
                      {color ? <Swatch hex={color.hex} /> : <span className="swatch none" />}
                      <select value={r.color} onChange={(e) => setFilament(i, { color: e.target.value })}>
                        <option value="">색상 선택 안 함</option>
                        {filament?.colors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="with-suffix">
                      <input
                        inputMode="decimal"
                        value={r.grams}
                        placeholder="0"
                        onChange={(e) => setFilament(i, { grams: e.target.value })}
                      />
                      <em>g</em>
                    </div>
                    <span className="amt" title={filamentUnitText(catalog, preview.filaments[i])}>
                      {amount == null ? '가격 없음' : won(amount)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="빼기"
                      onClick={() => onFilaments(values.filaments.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                  {error && <div className="err line-err">{error}</div>}
                </div>
              )
            })}
            <AddLine
              label="필라멘트 추가"
              onClick={() => onFilaments([...values.filaments, newFilamentLine(filaments)])}
            />
            {/* 합계 줄: 왼쪽에 줄 수 · 사용량, 오른쪽에 금액 (TBD-21) */}
            {values.filaments.length > 0 && (
              <div className="mat-total">
                <span className="cnt">
                  필라멘트 <b>{values.filaments.length}개</b> · <b>{gramsText(gramsSum)}g</b>
                </span>
                <span>
                  합계 <b>{won(filamentTotal)}</b>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="lines">
        <div className="lines-head">
          <h4>
            사용 부자재<small>1개 기준</small>
          </h4>
          <div className="head-btns">
            <button
              type="button"
              className="btn small"
              disabled={!parts.length}
              title="다른 제품의 부자재 항목을 넣어요 (수량은 직접)"
              onClick={onPickFrom}
            >
              + 다른 제품에서
            </button>
          </div>
        </div>
        {!parts.length ? (
          <div className="none">등록된 부자재가 없어요. 부자재 화면에서 먼저 추가하세요.</div>
        ) : (
          <div className="mat parts">
            {values.parts.length > 0 && (
              <div className="mat-head">
                <span>부자재</span>
                <span>수량</span>
                <span className="r">금액</span>
                <span />
              </div>
            )}
            {values.parts.map((r, i) => {
              const part = catalog.parts.get(Number(r.part))
              const amount = partAmount(catalog, preview.parts[i])
              const error = lineError(errors, 'parts', i)
              return (
                <div key={r.key}>
                  <div className={amount == null || !Number(r.qty) ? 'mat-row missing' : 'mat-row'}>
                    <select value={r.part} onChange={(e) => setPart(i, { part: e.target.value })}>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="with-suffix">
                      <input
                        inputMode="decimal"
                        value={r.qty}
                        placeholder="0"
                        onChange={(e) => setPart(i, { qty: e.target.value })}
                      />
                      <em>{part?.unit}</em>
                    </div>
                    <span className="amt" title={partUnitText(catalog, preview.parts[i])}>
                      {amount == null ? '가격 없음' : won(amount)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="빼기"
                      onClick={() => onParts(values.parts.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                  {error && <div className="err line-err">{error}</div>}
                </div>
              )
            })}
            <AddLine
              label="부자재 추가"
              onClick={() => onParts([...values.parts, { key: newKey(), part: String(parts[0].id), qty: '1' }])}
            />
            {values.parts.length > 0 && (
              <div className="mat-total">
                <span className="cnt">
                  부자재 <b>{values.parts.length}개</b>
                </span>
                <span>
                  합계 <b>{won(partTotal)}</b>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// 표 맨 아래 `+` 줄: 누르면 그 자리에 새 줄 (v1.2.0, 머리의 `+ 추가` 버튼 대신). 비어 있을 때도 이 줄 하나만 보인다
function AddLine({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="mat-add" onClick={onClick}>
      + {label}
    </button>
  )
}
