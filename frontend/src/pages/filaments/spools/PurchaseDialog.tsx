import type { Color, Filament, PurchaseInput } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { today } from '../../../format'
import { useForm } from '../../../useForm'
import { purchaseSchema } from './schemas'
import { useSpoolActions } from './spoolActions'
import Swatch from '../Swatch'

// 재고 추가: 수량 · 구매일 · 스풀 1개 구매가 · 번호 지정(선택) (PRD INV-02, docs/screens.md 1.7)
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
    code_nos: '',
  })

  const save = () =>
    submit(async ({ quantity, purchased_at, price, code_nos }) => {
      const input: PurchaseInput = { quantity, purchased_at }
      if (price != null) input.price = price
      if (code_nos.length) input.code_nos = code_nos
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
        <Field
          label="번호 지정 (선택)"
          full
          error={errors.code_nos}
          hint="지정한 번호를 먼저 쓰고, 모자란 만큼은 다음 번호부터 자동"
        >
          <input
            value={values.code_nos}
            placeholder="비우면 자동 · 예: 11, 15, 20-25"
            onChange={(e) => change('code_nos', e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  )
}
