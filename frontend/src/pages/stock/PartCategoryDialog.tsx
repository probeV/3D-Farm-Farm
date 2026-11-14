import { z } from 'zod'
import {
  createPartCategory,
  deletePartCategory,
  updatePartCategory,
  useRefreshProducts,
  type Part,
  type PartCategory,
  type PartKind,
} from '../../api/products'
import Dialog from '../../components/Dialog'
import Field from '../../components/Field'
import { useConfirm } from '../../components/useConfirm'
import { useToast } from '../../components/useToast'
import { useForm } from '../../useForm'
import { text } from '../../validation'
import { CATEGORY_EXAMPLE, KIND_LABEL } from './kinds'

// 서버: PartCategory — name max_length=50 (중복 불가, 서버만 검사)
const schema = z.object({ name: text(50) })

interface Props {
  kind: PartKind // 카테고리는 탭마다 따로
  category: PartCategory | null // null 이면 추가
  parts: Part[] // 삭제 확인 창에 이 카테고리의 부자재 이름을 보여 주려고
  onClose: () => void
  onSaved?: (category: PartCategory) => void // 부자재 창의 `+ 새 카테고리…` 에서 그 카테고리를 고르게
}

// 부자재 카테고리 추가 / 수정 (TBD-17, docs/screens.md 3.4).
// 지우면 그 부자재는 미분류 (원가는 그대로). 부자재가 있으면 다른 데이터가 바뀌는 삭제라 2차 확인
export default function PartCategoryDialog({ kind, category, parts, onClose, onSaved }: Props) {
  const L = KIND_LABEL[kind]
  const refresh = useRefreshProducts()
  const toast = useToast()
  const confirm = useConfirm()
  const { values, errors, busy, change, submit } = useForm(schema, { name: category?.name ?? '' })

  const save = () =>
    submit(async (data) => {
      const saved = category ? await updatePartCategory(category.id, data) : await createPartCategory({ kind, ...data })
      await refresh()
      toast('저장했어요')
      onSaved?.(saved)
      onClose()
    })

  const remove = async () => {
    if (!category) return
    const inside = parts.filter((p) => p.category === category.id)
    const ok = await confirm({
      title: '카테고리 삭제',
      message: `${category.name} 카테고리를 삭제할까요?`,
      danger: true,
      twice: inside.length > 0,
      effects: inside.length
        ? [
            {
              title: `${L} ${inside.length}개가 미분류가 돼요`,
              details: [inside.map((p) => p.name).join(' · '), '품목과 제품 원가는 그대로예요.'],
              tone: 'warn',
            },
          ]
        : [],
    })
    if (!ok) return
    try {
      await deletePartCategory(category.id)
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
      title={category ? '카테고리 수정' : '카테고리 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        category && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
    >
      <Field label="카테고리 이름 *" error={errors.name}>
        <input
          value={values.name}
          placeholder={`예: ${CATEGORY_EXAMPLE[kind]}`}
          data-autofocus
          onChange={(e) => change('name', e.target.value)}
        />
      </Field>
      {category && (
        <p className="hint">
          {L} {category.part_count}개
        </p>
      )}
    </Dialog>
  )
}
