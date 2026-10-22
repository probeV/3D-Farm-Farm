import { useContext, useEffect, useRef, type ReactNode } from 'react'
import { ToastLayerContext } from './useToast'

interface Props {
  title?: ReactNode
  headExtra?: ReactNode // 머리 오른쪽 (예: 간단 | 세부 전환)
  header?: ReactNode // 머리 전체를 바꿀 때 (제품 창의 머리 띠). 주면 title · headExtra 는 쓰지 않음
  size?: 'narrow' | 'wide' | 'xwide'
  onClose: () => void
  // 주면 아래에 `취소` + 이 이름의 저장 버튼, 없으면 `닫기` 만
  submitLabel?: string
  onSubmit?: () => void
  busy?: boolean // 저장 중에는 저장 버튼을 막음
  footerLeft?: ReactNode // 아래 왼쪽 (예: 삭제 버튼)
  children: ReactNode
}

// 대화상자(모달). 화면에 그리면 열리고, 그리지 않으면 닫힌다. Esc 로 닫힘
export default function Dialog({
  title,
  headExtra,
  header,
  size,
  onClose,
  submitLabel,
  onSubmit,
  busy,
  footerLeft,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const addToastLayer = useContext(ToastLayerContext)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!el.open) {
      el.showModal()
      // showModal 은 첫 입력칸에 커서를 둔다. 처음 쓸 칸을 정하려면 그 칸에 data-autofocus (React 의 autoFocus 는 여기서 덮임)
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return addToastLayer(el) // 열려 있는 동안 알림을 이 대화상자 안에 그린다
  }, [addToastLayer])

  return (
    <dialog
      ref={ref}
      className={size}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {/* 브라우저 기본 검사(말풍선)는 끄고 각 폼이 스키마로 검사한다 (src/validation.ts) */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) onSubmit?.()
        }}
      >
        {header ?? (
          <div className="dlg-head">
            <span className="title">{title}</span>
            {headExtra}
          </div>
        )}
        <div className="dlg-body">{children}</div>
        <div className="dlg-foot">
          {footerLeft}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {submitLabel ? '취소' : '닫기'}
          </button>
          {submitLabel && (
            <button type="submit" className="btn primary" disabled={busy}>
              {submitLabel}
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
