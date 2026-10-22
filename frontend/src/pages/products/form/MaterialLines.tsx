import type { Filament } from '../../../api/filaments'
import type { Part } from '../../../api/products'
import Swatch from '../../../components/Swatch'
import { won } from '../../../format'
import { filamentAmount, filamentUnitText, partAmount, partUnitText, type Catalog } from '../cost'
import { newFilamentLine, newKey, previewOf, type FilamentLine, type PartLine, type Values } from './draft'

interface Props {
  values: Values
  errors: Record<string, string>
  catalog: Catalog
  filaments: Filament[]
  parts: Part[]
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
  const { values, errors, catalog, filaments, parts, filamentTotal, partTotal, onFilaments, onParts } = props
  const preview = previewOf(values)

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
          <button
            type="button"
            className="btn small"
            disabled={!filaments.length}
            onClick={() => onFilaments([...values.filaments, newFilamentLine(filaments)])}
          >
            + 추가
          </button>
        </div>
        {values.filaments.length ? (
          <div className="mat">
            <div className="mat-head">
              <span>필라멘트</span>
              <span>색상</span>
              <span>사용량</span>
              <span className="r">금액</span>
              <span />
            </div>
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
            <div className="mat-total">
              <span>합계</span>
              <b>{won(filamentTotal)}</b>
            </div>
          </div>
        ) : (
          <div className="none">
            {filaments.length
              ? '사용하는 필라멘트가 없어요'
              : '등록된 필라멘트가 없어요. 필라멘트 화면에서 먼저 추가하세요.'}
          </div>
        )}
      </div>

      <div className="lines">
        <div className="lines-head">
          <h4>
            사용 부자재<small>1개 기준</small>
          </h4>
          <button
            type="button"
            className="btn small"
            disabled={!parts.length}
            title={parts.length ? undefined : '등록된 부자재가 없어요'}
            onClick={() => onParts([...values.parts, { key: newKey(), part: String(parts[0].id), qty: '1' }])}
          >
            + 추가
          </button>
        </div>
        {values.parts.length ? (
          <div className="mat parts">
            <div className="mat-head">
              <span>부자재</span>
              <span>수량</span>
              <span className="r">금액</span>
              <span />
            </div>
            {values.parts.map((r, i) => {
              const part = catalog.parts.get(Number(r.part))
              const amount = partAmount(catalog, preview.parts[i])
              const error = lineError(errors, 'parts', i)
              return (
                <div key={r.key}>
                  <div className={amount == null ? 'mat-row missing' : 'mat-row'}>
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
            <div className="mat-total">
              <span>합계</span>
              <b>{won(partTotal)}</b>
            </div>
          </div>
        ) : (
          <div className="none">사용하는 부자재가 없어요</div>
        )}
      </div>
    </>
  )
}
