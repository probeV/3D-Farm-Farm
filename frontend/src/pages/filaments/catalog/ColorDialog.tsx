import {
  createColor,
  deleteColor,
  updateColor,
  useRefreshFilaments,
  type Color,
  type Filament,
} from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { useToast } from '../../../components/useToast'
import { won } from '../../../format'
import { useForm } from '../../../useForm'
import { colorSchema, hex } from './schemas'

interface Props {
  filament: Filament // `+ 색상` 타일 또는 수정으로만 열리므로 필라멘트는 항상 고정
  color: Color | null // null 이면 추가
  onClose: () => void
}

// 색상 추가 / 수정 (PRD FIL-04 · FIL-05 · FIL-06, docs/screens.md 1.6)
export default function ColorDialog({ filament, color, onClose }: Props) {
  const refresh = useRefreshFilaments()
  const toast = useToast()
  const { values, errors, busy, change, submit } = useForm(colorSchema, {
    name: color?.name ?? '',
    hex: color?.hex ?? '#CCCCCC',
    price: color?.price != null ? String(color.price) : '',
  })

  // 색상 코드는 입력하는 동안 바로 미리보기 · 안내 (형식이 틀리면 빨간 안내)
  const parsedHex = hex.safeParse(values.hex)
  const hexOk = parsedHex.success ? parsedHex.data : null
  const hexError = errors.hex ?? (hexOk ? undefined : parsedHex.error?.issues[0].message)

  const save = () =>
    submit(async (data) => {
      if (color) await updateColor(color.id, data)
      else await createColor({ filament: filament.id, ...data })
      await refresh()
      toast('저장했어요')
      onClose()
    })

  // 스풀이 있으면 서버가 409 → 알림 (PRD FIL-09)
  const remove = async () => {
    if (!color || !confirm(`${filament.display_name} · ${color.name} 색상을 삭제할까요?`)) return
    try {
      await deleteColor(color.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      title={color ? '색상 수정' : '색상 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        color && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
    >
      <div className="form-grid">
        <Field label="회사 *">
          <select disabled>
            <option>{filament.brand_name}</option>
          </select>
        </Field>
        <Field label="필라멘트 *">
          <select disabled>
            <option>{filament.series ? `${filament.material_name} ${filament.series}` : filament.material_name}</option>
          </select>
        </Field>
        <Field label="색상 이름 *" error={errors.name}>
          <input value={values.name} placeholder="예: 화이트" onChange={(e) => change('name', e.target.value)} />
        </Field>
        <Field
          label="색상 코드 *"
          error={hexError}
          hint={hexOk ? `${hexOk} 로 저장 (붙여넣기 예: F5F5F5, #f5f5f5)` : undefined}
        >
          <div className="hex-input">
            <input
              value={values.hex}
              placeholder="#F5F5F5"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => change('hex', e.target.value)}
            />
            <span className="hex-preview" style={{ background: hexOk ?? 'transparent' }} />
            <input
              type="color"
              title="색 선택기"
              value={(hexOk ?? '#CCCCCC').toLowerCase()}
              onChange={(e) => change('hex', e.target.value.toUpperCase())}
            />
          </div>
        </Field>
        <Field
          label="가격"
          error={errors.price}
          hint={`비우면 필라멘트 가격 ${filament.price == null ? '(미입력)' : won(filament.price)} 사용`}
        >
          <div className="with-suffix">
            <input
              inputMode="numeric"
              value={values.price}
              placeholder={filament.price != null ? String(filament.price) : ''}
              onChange={(e) => change('price', e.target.value)}
            />
            <em>원</em>
          </div>
        </Field>
      </div>
    </Dialog>
  )
}
