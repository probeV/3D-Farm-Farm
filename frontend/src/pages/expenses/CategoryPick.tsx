import type { ExpenseCategory } from '../../api/expenses'
import { CATEGORIES, categoryInfo } from './categories'

interface Props {
  value: ExpenseCategory | ''
  onChange: (v: ExpenseCategory) => void
  showInfo?: boolean // 고른 분류의 예시 · v2 에서 어떻게 쓰이는지 한 줄 (지출 창)
}

// 분류 고르기: 버튼 7개 (EXP-03). 분류는 고정이라 선택 상자 대신 한눈에 보이게
export default function CategoryPick({ value, onChange, showInfo }: Props) {
  const info = value ? categoryInfo(value) : null
  return (
    <>
      <div className="cat-pick" role="radiogroup" aria-label="분류">
        {CATEGORIES.map((c) => (
          <label key={c.key} title={c.examples}>
            <input
              type="radio"
              name="category"
              value={c.key}
              checked={value === c.key}
              onChange={() => onChange(c.key)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {showInfo && (
        <div className="cat-desc">
          {info ? (
            <>
              <b>{info.label}</b> · 예: {info.examples}
              <br />
              {info.v2}
            </>
          ) : (
            '분류를 고르세요. 고른 분류에 따라 v2 손익에서 다르게 계산돼요.'
          )}
        </div>
      )}
    </>
  )
}
