// 화면 위 줄 오른쪽 ⚙ : 설정의 그 화면 분류로 바로 (TBD-16, 예: 제품 원가 → 설정 › 제품 원가)
export default function SettingsButton({ label, onClick }: { label: string; onClick: () => void }) {
  const title = `설정 › ${label}`
  return (
    <button type="button" className="btn gear" title={title} aria-label={title} onClick={onClick}>
      ⚙
    </button>
  )
}
