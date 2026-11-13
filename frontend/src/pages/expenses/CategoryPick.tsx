import type { ExpenseCategory } from '../../api/expenses'
import { CATEGORIES } from './categories'

interface Props {
  value: ExpenseCategory | ''
  onChange: (v: ExpenseCategory) => void
}

// 분류 고르기: 버튼 8개, 4칸 2줄 (EXP-03). 분류는 고정이라 선택 상자 대신 한눈에 보이게. 예시는 툴팁
export default function CategoryPick({ value, onChange }: Props) {
  return (
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
  )
}
