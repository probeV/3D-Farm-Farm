// 색 동그라미
export default function Swatch({ hex }: { hex: string }) {
  return <span className="swatch" style={{ background: hex }} />
}
