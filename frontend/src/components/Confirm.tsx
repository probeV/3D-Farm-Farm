import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmContext, type ConfirmOptions } from './useConfirm'
import { ToastLayerContext } from './useToast'

interface Asked {
  id: number // 새로 물을 때마다 창을 새로 그리기 (2차 확인 상태 초기화)
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

// 브라우저 기본 확인 창(confirm) 대신 쓰는 앱 대화상자 (docs/screens.md 공통 "삭제 확인", 목업 common.html)
export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [asked, setAsked] = useState<Asked | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setAsked((prev) => {
          prev?.resolve(false) // 이미 떠 있던 확인은 취소로
          return { id: (prev?.id ?? 0) + 1, options, resolve }
        })
      }),
    [],
  )

  const answer = (ok: boolean) => {
    asked?.resolve(ok)
    setAsked(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {asked && <ConfirmDialog key={asked.id} options={asked.options} onAnswer={answer} />}
    </ConfirmContext.Provider>
  )
}

// 열린 창이 있으면 그 위에 겹쳐 뜬다 (showModal 은 나중에 연 창이 위). 처음에는 `취소` 에 커서 → Enter 로 실수 삭제 안 함
function ConfirmDialog({ options: o, onAnswer }: { options: ConfirmOptions; onAnswer: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const addToastLayer = useContext(ToastLayerContext)
  const [armed, setArmed] = useState(!o.twice) // 2차 확인이면 처음 누를 때는 `정말 삭제` 로 바꾸기만

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!el.open) {
      el.showModal()
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return addToastLayer(el)
  }, [addToastLayer])

  const ok = () => {
    if (armed) return onAnswer(true)
    setArmed(true)
    okRef.current?.focus()
  }

  const okClass = !o.danger ? 'btn primary' : armed ? 'btn danger-fill' : 'btn danger-line'
  return (
    <dialog
      ref={ref}
      className={o.effects?.length ? 'narrow confirm has-effects' : 'narrow confirm'}
      onCancel={(e) => {
        e.preventDefault()
        onAnswer(false)
      }}
    >
      <form method="dialog" onSubmit={(e) => e.preventDefault()}>
        <div className="dlg-head">
          <span className="title">{o.title}</span>
        </div>
        <div className="dlg-body">
          <p className="lead">{o.message}</p>
          {!!o.effects?.length && (
            <div className={o.danger ? 'effects' : 'effects info'}>
              {o.effects.map((x, i) => (
                <div key={i} className={x.tone ? `effect ${x.tone}` : 'effect'}>
                  <div className="t">{x.title}</div>
                  {x.details?.map((d, j) => (
                    <div key={j} className="d">
                      {d}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {o.twice && armed && (
            <div className="again">
              {o.danger ? '한 번 더 누르면 삭제돼요. 되돌릴 수 없어요.' : '한 번 더 누르면 실행돼요.'}
            </div>
          )}
        </div>
        <div className="dlg-foot">
          <div className="spacer" />
          <button type="button" className="btn" data-autofocus onClick={() => onAnswer(false)}>
            취소
          </button>
          <button type="button" ref={okRef} className={okClass} onClick={ok}>
            {o.twice && armed ? (o.againLabel ?? '정말 삭제') : (o.okLabel ?? '삭제')}
          </button>
        </div>
      </form>
    </dialog>
  )
}
