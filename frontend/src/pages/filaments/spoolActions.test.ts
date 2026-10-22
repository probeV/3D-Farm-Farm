import { describe, expect, it } from 'vitest'
import type { Spool } from '../../api/filaments'
import { codesText } from './spoolActions'

describe('재고 추가 알림의 스풀 코드 표시', () => {
  const spools = (...nos: number[]) =>
    nos.map((n) => ({ id: n, code_no: n, code: `S${String(n).padStart(5, '0')}` }) as Spool)

  it('1개', () => {
    expect(codesText(spools(41))).toBe('S00041')
  })

  it('이어진 번호는 범위로', () => {
    expect(codesText(spools(41, 42, 43))).toBe('S00041 ~ S00043')
  })

  it('끊긴 번호는 나열 (번호를 지정해 추가한 경우)', () => {
    expect(codesText(spools(11, 51, 52))).toBe('S00011, S00051, S00052')
  })

  it('끊긴 번호가 5개를 넘으면 "외 N개"', () => {
    expect(codesText(spools(1, 3, 5, 7, 9, 11, 13))).toBe('S00001, S00003, S00005, S00007, S00009 외 2개')
  })
})
