// 서버 호출 공통: /api/v0/ 아래 JSON 을 주고받는다 (docs/api.md)
const BASE = '/api/v0'

// 오류 응답 모양: 400 `{"name": ["..."]}` (칸별 메시지) / 404 · 409 `{"detail": "..."}`
export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(errorMessage(status, body))
    this.status = status
    this.body = body
  }
}

// 화면 알림에 띄울 한 줄: detail 이 있으면 그것, 없으면 첫 번째 칸의 첫 메시지
function errorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const values = Object.values(body as Record<string, unknown>)
    const first = 'detail' in body ? (body as { detail: unknown }).detail : values[0]
    const msg = Array.isArray(first) ? first[0] : first
    if (typeof msg === 'string') return msg
  }
  return `요청을 처리하지 못했습니다. (${status})`
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, init)
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

// 본문을 보내는 요청 (POST · PATCH · DELETE). 객체는 JSON 으로, FormData(파일 올리기)는 multipart 로
export const send = <T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  api<T>(
    path,
    body instanceof FormData
      ? { method, body } // Content-Type(경계 문자열 포함)은 브라우저가 붙인다
      : {
          method,
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
  )

// 400 응답에서 칸 하나의 첫 메시지 (입력칸 아래 빨간 안내용)
export function fieldError(e: unknown, field: string): string | undefined {
  if (!(e instanceof ApiError) || e.status !== 400 || !e.body || typeof e.body !== 'object') return undefined
  const v = (e.body as Record<string, unknown>)[field]
  const msg = Array.isArray(v) ? v[0] : v
  return typeof msg === 'string' ? msg : undefined
}

// 400 응답 → 주어진 칸들의 오류 { name: '이미 있는 회사 이름입니다.' } (해당 칸이 없으면 빈 객체)
// 줄 목록 칸의 오류 `{"filaments": [{}, {"color": ["..."]}]}` 는 { 'filaments.1.color': '...' } 로 (validation.ts 와 같은 이름)
export function fieldErrorsOf(e: unknown, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const msg = fieldError(e, f)
    if (msg) out[f] = msg
    const rows = e instanceof ApiError && e.status === 400 ? (e.body as Record<string, unknown> | null)?.[f] : undefined
    if (!Array.isArray(rows)) continue
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') return
      for (const [k, v] of Object.entries(row)) {
        const rowMsg = Array.isArray(v) ? v[0] : v
        if (typeof rowMsg === 'string') out[`${f}.${i}.${k}`] = rowMsg
      }
    })
  }
  return out
}
