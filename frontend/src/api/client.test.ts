import { describe, expect, it } from 'vitest'
import { ApiError, fieldErrorsOf } from './client'

describe('서버 400 → 칸별 오류 (fieldErrorsOf)', () => {
  it('칸마다 첫 메시지, 요청한 칸만', () => {
    const e = new ApiError(400, { name: ['이미 있는 회사 이름입니다.'], other: ['x'] })
    expect(fieldErrorsOf(e, ['name', 'logo'])).toEqual({ name: '이미 있는 회사 이름입니다.' })
  })

  it('줄 목록 칸은 "목록.순서.칸" 으로 (제품의 사용 필라멘트 줄)', () => {
    const e = new ApiError(400, { filaments: [{}, { color: ['색상은 고른 필라멘트의 색상이어야 합니다.'] }] })
    expect(fieldErrorsOf(e, ['filaments'])).toEqual({
      'filaments.1.color': '색상은 고른 필라멘트의 색상이어야 합니다.',
    })
  })

  it('400 이 아니면 빈 객체 (알림으로)', () => {
    expect(fieldErrorsOf(new ApiError(409, { detail: '삭제할 수 없습니다.' }), ['detail'])).toEqual({})
    expect(fieldErrorsOf(new Error('x'), ['name'])).toEqual({})
  })
})
