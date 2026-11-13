import { useState } from 'react'
import { useColorBuys, type Color, type Filament, type PurchaseInput } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import Swatch from '../../../components/Swatch'
import { dotDate, today, won } from '../../../format'
import { useForm } from '../../../useForm'
import { purchaseSchema } from './schemas'
import { useSpoolActions } from './spoolActions'

// 재고 추가: 수량 · 구매일 · 주문(지출 장부) · 스풀 1개 구매가 · 번호 지정(선택) (PRD INV-02, docs/screens.md 1.7)
// 주문을 고르면 구매가 · 구매일은 주문에서 (고칠 수 없음), 수량은 남은 통까지 (v2 TBD-31).
// 기본값은 그 색상이 남은 최근 주문, `주문 없이` 면 지금처럼 직접 입력
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
  const buys = useColorBuys(color.id)
  // null = 아직 안 고름 → 남은 최근 주문 (불러오면). '' = 주문 없이
  const [buySel, setBuySel] = useState<number | '' | null>(null)
  const { values, errors, busy, change, submit } = useForm(purchaseSchema, {
    quantity: '1',
    purchased_at: today(),
    price: color.spool_price != null ? String(color.spool_price) : '',
    code_nos: '',
  })
  const list = buys.data ?? []
  const buyId = buySel ?? list[0]?.id ?? ''
  const order = buyId === '' ? undefined : list.find((b) => b.id === buyId)
  const left = order ? order.qty - order.spools : 100
  const over = order && Number(values.quantity) > left ? `이 주문은 ${left}통 남았어요` : undefined

  const save = () =>
    submit(async ({ quantity, purchased_at, price, code_nos }) => {
      if (over) throw new Error(over)
      const input: PurchaseInput = { quantity, purchased_at }
      if (order) input.buy = order.id
      else if (price != null) input.price = price
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
        <Field label="수량" error={errors.quantity ?? over}>
          <div className="with-suffix">
            <input inputMode="numeric" value={values.quantity} onChange={(e) => change('quantity', e.target.value)} />
            <em>개</em>
          </div>
        </Field>
        <Field label="구매일" error={order ? undefined : errors.purchased_at}>
          <input
            type="date"
            value={order ? order.date : values.purchased_at}
            readOnly={!!order}
            onChange={(e) => change('purchased_at', e.target.value)}
          />
        </Field>
        <Field
          label="주문 (지출 장부)"
          full
          hint={
            order
              ? `구매가 · 구매일은 주문에서 (배송비 나눠 넣음) · 최대 ${left}통`
              : '지출 장부와 따로 적어요 (같은 구매를 지출에도 적었다면 주문을 고르세요)'
          }
        >
          <select value={buyId} onChange={(e) => setBuySel(e.target.value ? Number(e.target.value) : '')}>
            {list.map((b) => (
              <option key={b.id} value={b.id}>
                {dotDate(b.date)} {b.name} · {b.qty - b.spools}통 남음 · {won(b.each)}
              </option>
            ))}
            <option value="">주문 없이 (구매가 직접 입력)</option>
          </select>
        </Field>
        <Field
          label="스풀 1개 구매가"
          full
          error={order ? undefined : errors.price}
          hint={
            order
              ? undefined
              : `기본값은 ${color.price != null ? '색상' : '필라멘트'} 가격이에요. 할인받았다면 실제 가격을 입력하세요.`
          }
        >
          <div className="with-suffix">
            <input
              inputMode="numeric"
              value={order ? String(order.each) : values.price}
              readOnly={!!order}
              onChange={(e) => change('price', e.target.value)}
            />
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
