// 엑셀(CSV) 내보내기 공통 (PRD-10 · EXP-07): UTF-8 BOM (엑셀에서 한글이 깨지지 않게)

// 모든 칸을 따옴표로 감싸고, 칸 안의 따옴표는 두 번 ("")
export function toCsv(rows: (string | number)[][]) {
  return '﻿' + rows.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
}

// 브라우저에서 파일로 내려받기
export function downloadText(filename: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
