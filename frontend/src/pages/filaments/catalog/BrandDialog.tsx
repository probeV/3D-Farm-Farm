import { useEffect, useRef, useState } from 'react'
import { createBrand, deleteBrand, updateBrand, useRefreshFilaments, type Brand } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { useConfirm } from '../../../components/useConfirm'
import { useToast } from '../../../components/useToast'
import { useForm } from '../../../useForm'
import BrandLogo from '../BrandLogo'
import { brandSchema } from './schemas'

interface Props {
  brand: Brand | null // null 이면 추가
  onClose: () => void
  onSaved: (brand: Brand) => void // 관리 창에서 저장한 회사를 선택
  onDeleted: () => void
}

// 회사 추가 / 수정 (PRD FIL-01 · FIL-01a). 로고는 png · jpg · webp, 서버가 256px 안으로 줄여 저장
export default function BrandDialog({ brand, onClose, onSaved, onDeleted }: Props) {
  const refresh = useRefreshFilaments()
  const toast = useToast()

  const confirm = useConfirm()
  const { values, errors, busy, change, submit } = useForm(brandSchema, {
    name: brand?.name ?? '',
    logo: null as File | null, // 새로 고른 파일
  })
  const [clearLogo, setClearLogo] = useState(false) // `이미지 지우기` 를 눌렀는지
  const fileRef = useRef<HTMLInputElement>(null)

  // 고른 파일 미리보기: 브라우저 안에서만 쓰는 임시 주소를 만들고, 바뀌거나 창을 닫으면 지운다
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!values.logo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(values.logo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [values.logo])
  const shownLogo = preview ?? (clearLogo ? null : (brand?.logo ?? null))

  const pickFile = (file: File | null) => {
    change('logo', file)
    setClearLogo(false)
  }
  const removeLogo = () => {
    change('logo', null)
    setClearLogo(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  // 새 파일이 있으면 multipart, 로고를 지웠으면 {"logo": null}, 아니면 이름만 (docs/api.md "로고 올리기 · 지우기")
  const save = () =>
    submit(async ({ name, logo }) => {
      let body: FormData | { name: string; logo?: null } = { name }
      if (logo) {
        body = new FormData()
        body.append('name', name)
        body.append('logo', logo)
      } else if (clearLogo && brand?.logo) {
        body = { name, logo: null }
      }
      const saved = brand ? await updateBrand(brand.id, body) : await createBrand(body)
      await refresh()
      toast('저장했어요')
      onSaved(saved)
      onClose()
    })

  const remove = async () => {
    if (!brand || !(await confirm({ title: '회사 삭제', message: `${brand.name} 회사를 삭제할까요?`, danger: true })))
      return
    try {
      await deleteBrand(brand.id)
      await refresh()
      toast('삭제했어요')
      onDeleted()
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      title={brand ? '회사 수정' : '회사 추가'}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={save}
      busy={busy}
      footerLeft={
        brand && (
          <button type="button" className="btn danger" onClick={remove}>
            삭제
          </button>
        )
      }
    >
      <div className="form-grid">
        <Field label="회사 이름 *" full error={errors.name}>
          <input value={values.name} placeholder="예: Bambu Lab" onChange={(e) => change('name', e.target.value)} />
        </Field>
        <Field label="대표 이미지" full error={errors.logo} hint="png · jpg · webp (5MB 까지), 256px 이내로 자동 축소">
          <div className="logo-input">
            <BrandLogo brand={{ name: values.name || '?', logo: shownLogo }} size="lg" />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <div>
                <button
                  type="button"
                  className="btn small"
                  style={{ marginTop: 6 }}
                  disabled={!shownLogo}
                  onClick={removeLogo}
                >
                  이미지 지우기
                </button>
              </div>
            </div>
          </div>
        </Field>
      </div>
    </Dialog>
  )
}
