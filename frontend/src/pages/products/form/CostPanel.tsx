import type { ReactNode } from 'react'
import type { CostSetting, PartCategory } from '../../../api/products'
import Help from '../../../components/Help'
import { gramsText, minutesText, pct, won } from '../../../format'
import { costFormulas, marginClass, partsByCategory, type Catalog, type Cost, type CostInput } from '../cost'
import type { Values } from './draft'

interface Props {
  values: Values
  errors: Record<string, string>
  change: <K extends keyof Values>(field: K, value: Values[K]) => void
  cost: Cost
  preview: CostInput // 입력 중인 값 (출력 시간 · 판매가)
  setting: CostSetting
  catalog: Catalog
  partCategories: PartCategory[]
}

// 원가 내역 한 줄: 이름 (+ 계산식 (?)) (+ 작은 설명) … 금액
function Line({ label, tip, sub, value }: { label: string; tip?: string; sub?: ReactNode; value: ReactNode }) {
  return (
    <div className="cost-line">
      <span className="label">
        {label}
        {tip && <Help tip={tip} />}
        {sub && <small>&nbsp;{sub}</small>}
      </span>
      <span>{value}</span>
    </div>
  )
}

// 오른쪽 원가 패널: 맨 위에 원가 입력값(출력 시간 · 판매가), 아래에 원가 내역 실시간 미리보기 (PRD-07 · PRD-08)
export default function CostPanel({
  values,
  errors,
  change,
  cost: c,
  preview,
  setting: S,
  catalog,
  partCategories,
}: Props) {
  const sale = preview.sale_price
  const minutes = preview.print_minutes
  const timeError = errors.hours ?? errors.minutes
  // (?) 계산식. 판매가가 없으면 수수료 · 순이익 · 순마진율 식은 숨김
  const f = costFormulas(preview, c, S)
  const byCategory = partsByCategory(preview, catalog, partCategories)

  return (
    <div className="cost-panel">
      <div className="panel-inputs">
        <div className="field">
          <span>출력 시간</span>
          <div className="time-input">
            <input
              inputMode="numeric"
              value={values.hours}
              placeholder="0"
              onChange={(e) => change('hours', e.target.value)}
            />
            <em>시간</em>
            <input
              inputMode="numeric"
              value={values.minutes}
              placeholder="0"
              onChange={(e) => change('minutes', e.target.value)}
            />
            <em>분</em>
          </div>
          {timeError && <span className="err">{timeError}</span>}
        </div>
        <label className="field">
          <span>판매가</span>
          <div className="with-suffix">
            <input
              inputMode="numeric"
              value={values.sale_price}
              placeholder="미입력"
              onChange={(e) => change('sale_price', e.target.value)}
            />
            <em>원</em>
          </div>
          {errors.sale_price && <span className="err">{errors.sale_price}</span>}
        </label>
      </div>

      <h4>
        원가 내역 <small>제품 1개 · 저장 전 미리보기</small>
      </h4>
      <Line label="필라멘트비" sub={c.grams ? `${gramsText(c.grams)}g` : ''} value={won(c.filament)} />
      <Line label="전기료" tip={f.electricity} sub={minutes ? minutesText(minutes) : ''} value={won(c.electricity)} />
      <Line label="부속품비" value={won(c.parts)} />
      {byCategory.length > 1 && (
        <div className="cost-sub">{byCategory.map((x) => `${x.name} ${won(x.amount)}`).join(' · ')}</div>
      )}
      <Line
        label="포장비"
        tip="기본 포장 세트 원가 (1개 보낼 때). 묶음 포장은 판매 창에서 주문마다"
        sub={preview.default_pack == null ? '기본 포장 없음' : catalog.packSets.get(preview.default_pack)?.name}
        value={won(c.pack)}
      />
      <div className="cost-total">
        <span className="label">
          원가
          <Help tip={f.cost} />
        </span>
        <strong>{won(c.cost)}</strong>
      </div>
      <div className="cost-gap" />
      <Line label="판매가" value={won(sale)} />
      <Line
        label="수수료"
        tip={sale ? f.fee : undefined}
        sub={`${(c.feeRate * 100).toFixed(2)}%`}
        value={sale ? `−${won(c.fee)}` : '-'}
      />
      {S.shipping_cost > 0 && <Line label="배송비" sub="판매자 부담" value={`−${won(S.shipping_cost)}`} />}
      <div className="cost-total">
        <span className="label">
          순이익
          {sale ? <Help tip={f.net} /> : null}
        </span>
        <strong className={sale ? marginClass(c.margin) : ''}>{won(c.net)}</strong>
      </div>
      <Line
        label="순마진율"
        tip={sale ? f.margin : undefined}
        value={<b className={marginClass(c.margin)}>{pct(c.margin)}</b>}
      />
      <div className="rec">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            권장 판매가
            {c.recommended != null && <Help tip={f.recommended} />} · 목표 마진 {S.target_margin}%
          </div>
          <b>{won(c.recommended)}</b>
        </div>
        {c.recommended != null && c.recommended !== sale && (
          <button type="button" className="btn small" onClick={() => change('sale_price', String(c.recommended))}>
            판매가로
          </button>
        )}
      </div>
      {c.warnings.length > 0 && (
        <ul className="warn-list">
          {c.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
