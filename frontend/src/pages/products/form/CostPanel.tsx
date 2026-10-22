import type { ReactNode } from 'react'
import type { CostSetting } from '../../../api/products'
import { minutesText, pct, won } from '../../../format'
import { marginClass, type Cost, type CostInput } from '../cost'
import type { Values } from './draft'

interface Props {
  values: Values
  errors: Record<string, string>
  change: <K extends keyof Values>(field: K, value: Values[K]) => void
  cost: Cost
  preview: CostInput // 입력 중인 값 (출력 시간 · 판매가)
  setting: CostSetting
}

function Line({ label, sub, value }: { label: string; sub?: ReactNode; value: ReactNode }) {
  return (
    <div className="cost-line">
      <span>
        {label}
        {sub && <small> {sub}</small>}
      </span>
      <span>{value}</span>
    </div>
  )
}

// 오른쪽 원가 패널: 맨 위에 원가 입력값(출력 시간 · 판매가), 아래에 원가 내역 실시간 미리보기 (PRD-07 · PRD-08)
export default function CostPanel({ values, errors, change, cost: c, preview, setting: S }: Props) {
  const sale = preview.sale_price
  const minutes = preview.print_minutes
  const timeError = errors.hours ?? errors.minutes

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
      <Line label="필라멘트비" sub={c.grams ? `${c.grams.toLocaleString('ko-KR')}g` : ''} value={won(c.filament)} />
      <Line label="전기료" sub={minutes ? minutesText(minutes) : ''} value={won(c.electricity)} />
      {/* 0원인 항목은 숨김 */}
      {c.depreciation > 0 && <Line label="감가상각" value={won(c.depreciation)} />}
      {c.failure > 0 && <Line label="실패 보정" sub={`${S.failure_rate}%`} value={won(c.failure)} />}
      <Line label="부자재비" value={won(c.parts)} />
      <div className="cost-total">
        <span>원가</span>
        <strong>{won(c.cost)}</strong>
      </div>
      <div className="cost-gap" />
      <Line label="판매가" value={won(sale)} />
      <Line label="수수료" sub={`${(c.feeRate * 100).toFixed(2)}%`} value={sale ? `−${won(c.fee)}` : '-'} />
      {S.shipping_cost > 0 && <Line label="배송비" sub="판매자 부담" value={`−${won(S.shipping_cost)}`} />}
      <div className="cost-total">
        <span>순이익</span>
        <strong className={sale ? marginClass(c.margin) : ''}>{won(c.net)}</strong>
      </div>
      <div className="margin-row">
        <span className="muted">순마진율&nbsp;</span>
        <b className={marginClass(c.margin)}>{pct(c.margin)}</b>
      </div>
      <div className="rec">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            권장 판매가 · 목표 마진 {S.target_margin}%
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
