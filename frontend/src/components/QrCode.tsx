import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import { qrPrintMm } from '../pages/filaments/qr/labels'

// QR 코드 그림 (SVG). 모듈 하나 = 1 단위, 둘레 2칸 흰 여백 (라벨 둘레도 흰색이라 이 정도면 찍힘)
const QUIET = 2

interface Props {
  text: string
  className?: string
  // 인쇄할 때 들어갈 수 있는 가장 큰 크기(mm). 주면 칸 하나 = 감열 프린터 점 정수 개가 되도록 크기를 맞춘다 (v2.1.0).
  // 안 주면 크기는 CSS 로
  fitMm?: number
}

export default function QrCode({ text, className, fitMm }: Props) {
  const { n, d } = useMemo(() => {
    // 0 = 크기 자동, L = 7% 가 가려져도 읽힘 — 칸 수가 적어 칸 하나가 커지고 감열 라벨에서 또렷하다
    const qr = qrcode(0, 'L')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { n, d }
  }, [text])
  const size = n + QUIET * 2
  const mm = fitMm == null ? undefined : `${qrPrintMm(size, fitMm)}mm`
  return (
    <svg
      className={className}
      viewBox={`${-QUIET} ${-QUIET} ${size} ${size}`}
      shapeRendering="crispEdges"
      style={mm ? { width: mm, height: mm } : undefined}
      aria-label={text}
    >
      <rect x={-QUIET} y={-QUIET} width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
