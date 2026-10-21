// 화면 표시용 숫자 모양. 서버는 반올림하지 않은 값을 주고, 원 단위 반올림은 화면에서 한다 (docs/api.md)

// 14400 → "14,400원", 없으면 "-"
export const won = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR') + '원')

// 소수 첫째 자리까지: 2.25 → "2.3", 12 → "12"
export const kgText = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ko-KR')
