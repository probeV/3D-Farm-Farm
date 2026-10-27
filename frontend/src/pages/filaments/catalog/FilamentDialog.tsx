import { useState } from 'react'
import {
  createFilament,
  deleteFilament,
  updateFilament,
  useMaterials,
  useRefreshFilaments,
  type Brand,
  type Filament,
} from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { useConfirm } from '../../../components/useConfirm'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import MaterialDialog from './MaterialDialog'
import { filamentSchema } from './schemas'

const NEW_MATERIAL = 'new'

interface Props {
  brand: Brand // 관리 창에서 고른 회사 (수정할 때도 회사는 바꾸지 않음)
  filament: Filament | null // null 이면 추가
  copyOf?: Filament // 복제: 값(재질 · 시리즈 · 가격 · 무게)만 복사, 색상은 복사하지 않음. 저장해야 추가됨
  onClose: () => void
}

// 필라멘트 추가 / 수정 (PRD FIL-03). 회사 · 재질 · 시리즈 조합 중복은 서버가 400 (series 칸), 색상이 있으면 삭제 시 409
export default function FilamentDialog({ brand, filament, copyOf, onClose }: Props) {
  const materials = useMaterials().data ?? []
  const refresh = useRefreshFilaments()
  const toast = useToast()

  const confirm = useConfirm()
  const from = filament ?? copyOf
  const { values, errors, busy, change, submit } = useForm(filamentSchema, {
    material: String(from?.material ?? materials[0]?.id ?? ''),
    // 복제는 시리즈 뒤에 (복사): 회사 · 재질 · 시리즈 조합이 겹치지 않게
    series: copyOf ? `${copyOf.series ? `${copyOf.series} ` : ''}(복사)` : (filament?.series ?? ''),
    price: from?.price != null ? String(from.price) : '',
    spool_g: String(from?.spool_g ?? 1000),
  })
  const [addingMaterial, setAddingMaterial] = useState(false)

  const materialName = materials.find((m) => String(m.id) === values.material)?.name ?? '?'
  const series = values.series.trim()

  const save = () =>
    submit(async (data) => {
      if (filament) await updateFilament(filament.id, data)
      else await createFilament({ brand: brand.id, ...data })
      await refresh()
      toast('저장했어요')
      onClose()
    })

  // 색상이 있으면 지울 수 없어 확인 창 없이 이유만. 제품에서 쓰면 서버가 409 (PRD FIL-09)
  const remove = async () => {
    if (filament?.colors.length) return toast(`색상 ${filament.colors.length}개가 있어서 삭제할 수 없어요`)
    if (
      !filament ||
      !(await confirm({
        title: '필라멘트 삭제',
        message: `${filament.display_name} 필라멘트를 삭제할까요?`,
        danger: true,
      }))
    )
      return
    try {
      await deleteFilament(filament.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Dialog
        title={
          <>
            {filament ? '필라멘트 수정' : `${brand.name} 필라멘트 추가`}
            {copyOf && <span className="copy-from">{copyOf.display_name}에서 복제</span>}
          </>
        }
        onClose={onClose}
        submitLabel="저장"
        onSubmit={save}
        busy={busy}
        footerLeft={
          filament && (
            <button type="button" className="btn danger" onClick={remove}>
              삭제
            </button>
          )
        }
      >
        <div className="form-grid">
          <Field label="재질 *" error={errors.material}>
            <select
              value={values.material}
              // 목록 끝 `+ 새 재질…` 을 고르면 재질 추가 창을 열고, 선택은 그대로 둔다
              onChange={(e) =>
                e.target.value === NEW_MATERIAL ? setAddingMaterial(true) : change('material', e.target.value)
              }
            >
              {!materials.length && <option value="">재질을 먼저 추가하세요</option>}
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value={NEW_MATERIAL}>+ 새 재질…</option>
            </select>
          </Field>
          <Field label="시리즈" error={errors.series}>
            <input
              value={values.series}
              placeholder="예: Matte (없으면 비움)"
              onChange={(e) => change('series', e.target.value)}
            />
          </Field>
          <Field label="스풀 가격" error={errors.price}>
            <div className="with-suffix">
              <input inputMode="numeric" value={values.price} onChange={(e) => change('price', e.target.value)} />
              <em>원</em>
            </div>
          </Field>
          <Field label="스풀 무게" error={errors.spool_g}>
            <div className="with-suffix">
              <input inputMode="decimal" value={values.spool_g} onChange={(e) => change('spool_g', e.target.value)} />
              <em>g</em>
            </div>
          </Field>
          <Field label="표시 이름" full>
            <div className="hint">
              {brand.name} › {materialName}
              {series && ` ${series}`}
            </div>
          </Field>
        </div>
      </Dialog>
      {/* 대화상자 안에 넣지 않고 옆에 그린다 (form 안에 form 이 들어가지 않도록). 나중에 열린 창이 위에 뜬다 */}
      {addingMaterial && (
        <MaterialDialog
          material={null}
          onClose={() => setAddingMaterial(false)}
          onSaved={(m) => change('material', String(m.id))}
        />
      )}
    </>
  )
}
