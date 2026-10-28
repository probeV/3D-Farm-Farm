// 화면 표시용 숫자 모양. 서버는 반올림하지 않은 값을 주고, 원 단위 반올림은 화면에서 한다 (docs/api.md)

// 14400 → "14,400원", 없으면 "-"
export const won = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR') + '원')

// 개당 단가: 10원 미만은 소수 첫째 자리까지 (8.9 → "8.9원"), 그 이상은 원 단위 (17.8 → "18원"), 없으면 "-"
export const unitWon = (n: number | null | undefined) =>
  n == null ? '-' : (n < 10 ? Math.round(n * 10) / 10 : Math.round(n)).toLocaleString('ko-KR') + '원'

// 사용량 g: 소수 둘째 자리까지 (24.37 → "24.37", 180.57000001 → "180.57", 1200 → "1,200")
export const gramsText = (n: number) => (Math.round(n * 100) / 100).toLocaleString('ko-KR')

// 소수 첫째 자리까지: 2.25 → "2.3", 12 → "12"
export const kgText = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ko-KR')

// 날짜만: "2026-10-20T13:33:30+09:00" → "2026-10-20" (서버가 서울 시간으로 줌), 없으면 "-"
export const dateText = (v: string | null) => (v ? v.slice(0, 10) : '-')

// 날짜 점 모양: "2026-10-21" → "2026.10.21" (지출 목록)
export const dotDate = (v: string) => v.replace(/-/g, '.')

// 오늘 날짜 "2026-10-21" (이 PC 시간 기준)
export function today() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 비율 → 소수 첫째 자리 %: 0.2534 → "25.3%", 없으면 "-"
export const pct = (r: number | null) => (r == null ? '-' : (Math.round(r * 1000) / 10).toLocaleString('ko-KR') + '%')

// 분 → "35분" · "3시간" · "3시간 20분", 없거나 0 이면 "-"
export function minutesText(min: number | null) {
  if (!min) return '-'
  if (min < 60) return `${min}분`
  const rest = min % 60
  return `${Math.floor(min / 60)}시간${rest ? ` ${rest}분` : ''}`
}
