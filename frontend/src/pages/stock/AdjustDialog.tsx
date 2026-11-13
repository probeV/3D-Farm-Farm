import { adjustPart, useRefreshProducts, type AdjustMode, type Part } from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useToast } from '../../components/useToast'
import { useForm } from '../../useForm'
import { qty } from './kinds'
import { adjustSchema } from './schemas'

const MODES: { mode: AdjustMode; label: string }[] = [
  { mode: 'set', label: '실제 수량으로 맞추기' },
  { mode: 'sub', label: '빼기' },
  { mode: 'add', label: '더하기' },
]
const REASONS = ['재고 실사', '파손 · 불량', '샘플 · 시험 출력', '지출 없이 받음']

// 남은 수량 조정 (STOCK-04, docs/screens.md 3.7). 구매(지출) · 판매 · 다 씀 말고 그 밖의 차이만. 사유는 입출고 기록에 남는다
export default function AdjustDialog({ part, onClose }: { part: Part; onClose: () => void }) {
  const refresh = useRefreshProducts()
  const toast = useToast()
  const { values, errors, busy, change, update, submit } = useForm(adjustSchema, {
    mode: 'set' as AdjustMode,
    qty: String(part.stock),
    note: '',
  })
  const n = Number(values.qty) || 0
  const after = values.mode === 'set' ? n : values.mode === 'add' ? part.stock + n : part.stock - n
  const diff = after - part.stock

  const save = () =>
    submit(async (data) => {
      if (data.mode === 'set' && data.qty === part.stock) {
        toast('바뀐 수량 없음')
        return
      }
      const saved = await adjustPart(part.id, data)
      await refresh()
      toast(`${part.name} ${qty(saved.stock)}${part.unit} 으로 조정했어요`)
      onClose()
    })

  return (
    <Dialog
      title={
        <>
          남은 수량 조정 <span className="copy-from">{part.name}</span>
        </>
      }
      onClose={onClose}
      submitLabel="조정"
      onSubmit={save}
      busy={busy}
    >
      <div className="form-grid">
        <div className="field full">
          <span>방식</span>
          <div className="seg">
            {MODES.map((m) => (
              <label key={m.mode}>
                <input
                  type="radio"
                  name="mode"
                  checked={values.mode === m.mode}
                  // 맞추기는 지금 수량, 빼기 · 더하기는 1 부터
                  onChange={() => update({ mode: m.mode, qty: m.mode === 'set' ? String(part.stock) : '1' })}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label={values.mode === 'set' ? '세어 본 수량' : '수량'} error={errors.qty}>
          <div className="with-suffix">
            <input
              inputMode="decimal"
              data-autofocus
              value={values.qty}
              onChange={(e) => change('qty', e.target.value)}
            />
            <em>{part.unit}</em>
          </div>
        </Field>
        <Field label="사유" error={errors.note}>
          <input
            list="adjust-reasons"
            value={values.note}
            placeholder="예: 재고 실사"
            onChange={(e) => change('note', e.target.value)}
          />
          <datalist id="adjust-reasons">
            {REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <div className="field full">
          <div className="adj-preview">
            <span>
              지금{' '}
              <b>
                {qty(part.stock)}
                {part.unit}
              </b>{' '}
              →
            </span>
            <b>
              {qty(after)}
              {part.unit} ({diff >= 0 ? '+' : ''}
              {qty(diff)})
            </b>
          </div>
          <span className="hint">구매는 지출 장부에서 넣으면 자동으로 더해져요. 여기는 그 밖의 차이만</span>
        </div>
      </div>
    </Dialog>
  )
}
