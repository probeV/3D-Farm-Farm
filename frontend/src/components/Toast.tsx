import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastContext, ToastLayerContext, type ToastAction, type Undo } from './useToast'

interface Shown {
  id: number
  message: string
  undo?: Undo
  action?: ToastAction
}

// 화면 하단 알림. 기본 2.2초, `되돌리기` · 바로가기 버튼이 있으면 7초 (docs/screens.md 공통)
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null)
  // 열린 모달 대화상자 (열린 순서). 있으면 가장 위 대화상자 안에, 없으면 body 에 그린다
  const [layers, setLayers] = useState<HTMLElement[]>([])

  const toast = useCallback(
    (message: string, undo?: Undo, action?: ToastAction) => setShown({ id: Date.now(), message, undo, action }),
    [],
  )
  const addLayer = useCallback((dialog: HTMLElement) => {
    setLayers((l) => [...l, dialog])
    return () => setLayers((l) => l.filter((x) => x !== dialog))
  }, [])

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), shown.undo || shown.action ? 7000 : 2200)
    return () => clearTimeout(timer)
  }, [shown])

  const runUndo = async (undo: Undo) => {
    setShown(null)
    try {
      await undo()
      toast('되돌렸어요')
    } catch (e) {
      toast(`되돌리지 못했어요: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <ToastContext.Provider value={toast}>
      <ToastLayerContext.Provider value={addLayer}>
        {children}
        {shown &&
          createPortal(
            <div className="toast" role="status">
              <span>{shown.message}</span>
              {shown.undo && (
                <button type="button" onClick={() => runUndo(shown.undo!)}>
                  되돌리기
                </button>
              )}
              {shown.action && (
                <button
                  type="button"
                  onClick={() => {
                    setShown(null)
                    shown.action!.run()
                  }}
                >
                  {shown.action.label}
                </button>
              )}
            </div>,
            layers[layers.length - 1] ?? document.body,
          )}
      </ToastLayerContext.Provider>
    </ToastContext.Provider>
  )
}
