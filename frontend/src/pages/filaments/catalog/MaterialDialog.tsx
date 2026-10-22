import {
  createMaterial,
  deleteMaterial,
  updateMaterial,
  useRefreshFilaments,
  type Material,
} from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import { materialSchema } from './schemas'

interface Props {
  material: Material | null // null 이면 추가
  onClose: () => void
  onSaved?: (material: Material) => void // 필라멘트 창의 `+ 새 재질…` 에서 열었을 때 만든 재질을 바로 고르기
}

// 재질 추가 / 수정 (PRD FIL-02). 이름 중복은 서버가 400, 필라멘트에서 쓰면 삭제 시 409
export default function MaterialDialog({ material, onClose, onSaved }: Props) {
  const refresh = useRefreshFilaments()
  const toast = useToast()
  const { values, errors, busy, change, submit } = useForm(materialSchema, { name: material?.name ?? '' })

  const save = () =>
    submit(async (data) => {
      const saved = material ? await updateMaterial(material.id, data) : await createMaterial(data)
      await refresh()
      toast('저장했어요')
      onSaved?.(saved)
      onClose()
    })

  const remove = async () => {
    if (!material || !confirm(`${material.name} 재질을 삭제할까요?`)) return
    try {
      await deleteMaterial(material.id)
      await refresh()
      toast('삭제했어요')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      size="narrow"
      title={material ? '재질 수정' : '재질 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        material && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
    >
      <div className="form-grid">
        <Field label="재질 이름 *" full error={errors.name}>
          <input value={values.name} placeholder="예: PETG-CF" onChange={(e) => change('name', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
