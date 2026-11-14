import type { Color, Filament, PurchaseInput } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import Swatch from '../../../components/Swatch'
import { today } from '../../../format'
import { useForm } from '../../../useForm'
import { purchaseSchema } from './schemas'
import { useSpoolActions } from './spoolActions'

// 재고 추가: 수량 · 구매일 · 스풀 1개 구매가 (PRD INV-02, docs/screens.md 1.7).
// 지출 없이 들어온 스풀(선물 · 예전 재고)용 — 산 스풀은 필라멘트 지출을 저장하면 생긴다 (v2 TBD-33).
// 번호는 항상 다음 번호부터 (지운 번호는 다시 안 씀)
export default function PurchaseDialog({
  filament,
  color,
  onClose,
}: {
  filament: Filament
  color: Color
  onClose: () => void
}) {
  const actions = useSpoolActions()
  const { values, errors, busy, change, submit } = useForm(purchaseSchema, {
    quantity: '1',
    purchased_at: today(),
    price: color.spool_price != null ? String(color.spool_price) : '',
  })

  const save = () =>
    submit(async ({ quantity, purchased_at, price }) => {
      const input: PurchaseInput = { quantity, purchased_at }
      if (price != null) input.price = price
      await actions.purchase(color, input)
      onClose()
    })

  return (
    <Dialog
      title={
        <>
          <Swatch hex={color.hex} /> {filament.display_name} · {color.name} 재고 추가
        </>
      }
      onClose={onClose}
      submitLabel="재고에 추가"
      onSubmit={save}
      busy={busy}
    >
      <div className="form-grid">
        <Field label="수량" error={errors.quantity}>
          <div className="with-suffix">
            <input inputMode="numeric" value={values.quantity} onChange={(e) => change('quantity', e.target.value)} />
            <em>개</em>
          </div>
        </Field>
        <Field label="구매일" error={errors.purchased_at}>
          <input type="date" value={values.purchased_at} onChange={(e) => change('purchased_at', e.target.value)} />
        </Field>
        <Field
          label="스풀 1개 구매가"
          full
          error={errors.price}
          hint={`기본값은 ${color.price != null ? '색상' : '필라멘트'} 가격이에요. 할인받았다면 실제 가격을 입력하세요.`}
        >
          <div className="with-suffix">
            <input inputMode="numeric" value={values.price} onChange={(e) => change('price', e.target.value)} />
            <em>원</em>
          </div>
        </Field>
        <p className="hint full-row">
          지출 없이 들어온 스풀용 (선물 · 예전 재고). 산 스풀은 <b>지출</b>에 적으면 자동으로 생겨요
        </p>
      </div>
    </Dialog>
  )
}
