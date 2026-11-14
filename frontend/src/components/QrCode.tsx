import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

// QR 코드 그림 (SVG). 크기는 CSS 로 — 모듈 하나 = 1 단위, 둘레 2칸 흰 여백 (라벨 둘레도 흰색이라 이 정도면 찍힘)
const QUIET = 2

export default function QrCode({ text, className }: { text: string; className?: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, 'M') // 0 = 크기 자동, M = 15% 가 가려져도 읽힘
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { n, d }
  }, [text])
  const size = n + QUIET * 2
  return (
    <svg
      className={className}
      viewBox={`${-QUIET} ${-QUIET} ${size} ${size}`}
      shapeRendering="crispEdges"
      aria-label={text}
    >
      <rect x={-QUIET} y={-QUIET} width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
