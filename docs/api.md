# API — 3D Farm Farm (쓰리디팜팜)

> 요구사항: [PRD.md](PRD.md) · 데이터 구조: [ERD.md](ERD.md) · 코드 구조: [architecture.md](architecture.md)

화면(React)과 서버(Django REST Framework)가 주고받는 JSON API.
개발 중에는 Vite 개발 서버가 `/api` 요청을 Django 로 넘긴다. 브라우저로 `http://127.0.0.1:8000/api/v0/` 를 열면 목록을 직접 볼 수 있다.

## 공통 규칙
| 항목 | 규칙 |
|---|---|
| 주소 | `/api/v0/...`. 주소·응답 모양이 바뀌는 변경은 `v1` 을 새로 만들고 `v0` 는 그대로 둔다 |
| 로그인 | 없음 (같은 와이파이 안에서만 쓰는 앱, PRD 1장) |
| 수정 | `PATCH` (바꿀 칸만 보냄). 전체 교체 `PUT` 은 쓰지 않음 (405) |
| 금액 · 무게 | 숫자. 소수점 아래가 0 이면 정수(`14400`, `1000`), 아니면 소수(`1000.5`). g당 가격은 소수 2자리(`14.4`). 원 단위 반올림은 화면에서 |
| 날짜 · 시각 | 날짜 `2026-10-20`, 시각 `2026-10-20T13:33:30+09:00` (서울 시간) |
| 목록 | 페이지 나눔 없이 전부 (데이터가 수백 건 수준). 검색 · 필터 · 정렬 · 요약 계산은 화면에서 |

### 오류 응답
| 상태 | 언제 | 모양 |
|---|---|---|
| 400 | 입력이 틀림 (본문 · 쿼리 파라미터 · 스풀 코드) | 칸별 한국어 메시지 `{"name": ["이미 있는 회사 이름입니다."]}` |
| 404 | 대상이 없음 (없는 id, 숫자가 아닌 id 포함) | `{"detail": "찾을 수 없습니다."}` |
| 409 | 다른 데이터가 쓰고 있어서 삭제 불가 (PRD FIL-09) | `{"detail": "필라멘트가 있어서 삭제할 수 없습니다."}` |

- 오류 문구는 `~입니다` 체로 쓴다 (DRF 기본 문구 `이 필드는 필수 항목입니다.` 등도 같은 말투)

### 입력 검사 위치
| 입력 | 검사 | 틀리면 |
|---|---|---|
| 요청 본문 (JSON · multipart) | 시리얼라이저 | 400 |
| 쿼리 파라미터 (`?color=3&status=sealed`) | 시리얼라이저 (`SpoolFilterSerializer`) | 400 `{"color": ["유효한 정수를 입력하세요."]}` |
| 경로의 스풀 코드 (`/spools/code/S00012/`) | 시리얼라이저 (`SpoolCodeSerializer`) | 400 |
| 경로의 id (`/spools/12/`) | DRF 가 id 로 찾기 | 404 (숫자가 아니어도 JSON 404) |

## 엔드포인트 한눈에
| 메서드 | 주소 | 용도 |
|---|---|---|
| GET · POST | `/api/v0/brands/` | 회사 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/brands/{id}/` | 회사 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/materials/` | 재질 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/materials/{id}/` | 재질 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/filaments/` | **필라멘트 화면 데이터 전부** / 필라멘트 추가 |
| GET · PATCH · DELETE | `/api/v0/filaments/{id}/` | 필라멘트 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/colors/` | 색상 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/colors/{id}/` | 색상 하나 / 수정 / 삭제 |
| POST | `/api/v0/colors/{id}/spools/` | 재고 추가 |
| GET · POST | `/api/v0/spools/` | 스풀 목록(`?color=&status=`) / 스풀 1개 만들기 |
| GET · PATCH · DELETE | `/api/v0/spools/{id}/` | 스풀 하나 / 수정 / 삭제 |
| DELETE | `/api/v0/spools/?ids=3,4,5` | 여러 개 삭제 |
| GET | `/api/v0/spools/code/{code}/` | 코드로 스풀 찾기 |

---

## 회사 `brands`
```json
{ "id": 1, "name": "Bambu Lab", "logo": "/media/brands/bambu.png", "filament_count": 1 }
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `name` | ✅ 필수 | 중복 불가 → 400 `이미 있는 회사 이름입니다.` |
| `logo` | 선택 | 대표 이미지(로고). 응답은 상대 주소 `/media/brands/...` 또는 `null` (없으면 화면에서 첫 글자 아이콘) |
| `filament_count` | — | 이 회사의 필라멘트 수 |

### 로고 올리기 · 지우기
| 하려는 것 | 요청 |
|---|---|
| 이름 + 로고로 추가 | `POST /brands/` — `multipart/form-data` 로 `name`, `logo`(파일) |
| 로고 바꾸기 | `PATCH /brands/{id}/` — `multipart/form-data` 로 `logo`(파일) |
| 로고 지우기 | `PATCH /brands/{id}/` — JSON `{"logo": null}` |
| 이름만 바꾸기 | `PATCH /brands/{id}/` — JSON `{"name": "..."}` (로고는 그대로) |

- png · jpg · webp 만, 5MB 까지 → 아니면 400 (`png, jpg, webp 이미지만 올릴 수 있습니다.` / `이미지는 5MB 까지 올릴 수 있습니다.`)
- 서버가 비율을 유지해 256×256 안으로 줄여 저장한다 (작은 이미지는 그대로, 형식도 그대로)
- 로고를 바꾸거나 지우거나 회사를 삭제하면 이전 파일도 지운다
- 삭제: 필라멘트가 있으면 409 `필라멘트가 있어서 삭제할 수 없습니다.` (로고 파일도 그대로)
- 목록 순서: 이름순

## 재질 `materials`
```json
{ "id": 1, "name": "PLA", "filament_count": 1 }
```
- `name` 중복 불가 → 400 `이미 있는 재질입니다.`
- 삭제: 필라멘트에서 쓰면 409 `필라멘트에서 쓰고 있어서 삭제할 수 없습니다.`

## 필라멘트 `filaments`
필라멘트 화면은 **이 목록 하나로 그린다.** 색상과 색상별 스풀 개수가 함께 온다.
전체 요약 · 회사별 kg · 검색 · 필터 · 정렬은 화면에서 이 데이터로 계산한다 (회사 이름 · 로고는 `brands` 목록에서).

```json
{
  "id": 1,
  "brand": 1, "brand_name": "Bambu Lab",
  "material": 1, "material_name": "PLA",
  "series": "Basic",
  "display_name": "Bambu Lab › PLA Basic",
  "price": 14400, "spool_g": 1000,
  "avg_held_price": 14400,
  "colors": [
    {
      "id": 1, "filament": 1, "name": "화이트", "hex": "#F5F5F5",
      "price": null, "spool_price": 14400, "price_per_g": 14.4,
      "counts": { "sealed": 1, "open": 1, "empty": 0 }
    }
  ]
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `brand` · `material` | ✅ 필수 | id |
| `series` | 선택 | 비우면 `""`. 회사 · 재질 · 시리즈 조합 중복 → 400 (`series` 칸에 메시지) |
| `price` | 선택 | 스풀 가격. `null` = 미입력 |
| `spool_g` | 선택 | 스풀 무게(g), 기본 1000 |
| `display_name` | — | `회사 › 재질 시리즈` |
| `avg_held_price` | — | 보유(재고 + 사용 중) 스풀 구매가 평균, 원 단위 반올림. 없으면 `null` (PRD INV-08) |
| `colors` | — | 색상 목록 (아래 색상과 같은 모양) |

- 삭제: 색상이 있으면 409 `색상이 있어서 삭제할 수 없습니다.`
- 목록 순서: 회사 이름 → 재질 이름 → 시리즈

### 화면에서 계산하는 값 (참고)
```
보유 kg (색상)      = (counts.sealed + counts.open) × spool_g ÷ 1000
회사별 상태별 kg    = 그 회사 필라멘트들의 Σ counts.상태 × spool_g ÷ 1000
재고 없는 색상      = sealed 0 이고 open 1 이상
소진된 색상         = sealed 0 이고 open 0
```

## 색상 `colors`
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `filament` | ✅ 필수 | 필라멘트 id |
| `name` | ✅ 필수 | 같은 필라멘트 안에서 중복 → 400 `이 필라멘트에 같은 이름의 색상이 이미 있습니다.` |
| `hex` | ✅ 필수 | `F5F5F5` / `#f5f5f5` 모두 받아 `#F5F5F5` 로 저장. 형식이 틀리면 400 |
| `price` | 선택 | 비우면(`null`) 필라멘트 가격을 따름 |
| `spool_price` | — | 실제 적용되는 스풀 가격 (색상 가격 또는 필라멘트 가격) |
| `price_per_g` | — | g당 가격 (소수 2자리) |
| `counts` | — | 상태별 스풀 개수 `{sealed, open, empty}` |

- 삭제: 스풀이 있으면 409 `스풀이 있어서 삭제할 수 없습니다.`

### 재고 추가 `POST /api/v0/colors/{id}/spools/`
```json
{ "quantity": 3, "purchased_at": "2026-10-20", "price": 14400, "code_nos": [11] }
```
| 칸 | 설명 |
|---|---|
| `quantity` | 1~100 (필수) |
| `purchased_at` | 비우면 오늘 |
| `price` | 스풀 1개 구매가. 비우면 색상의 `spool_price` |
| `code_nos` | 쓰고 싶은 스풀 번호 목록 (선택). 지정한 번호를 먼저 쓰고, 모자란 만큼은 다음 번호부터 자동 (지정한 번호와 겹치면 건너뜀). 비우면 전부 자동. 수량보다 많거나 같은 번호가 두 번 있거나 이미 있는 번호면 400, 아무것도 만들지 않음 |

- 응답 201: 만든 스풀 목록 (번호 순서). 알림에 `S00041 ~ S00043` 처럼 범위를 보여줄 때 사용
- 예: 가장 큰 번호가 50 이고 `S00011` 을 지웠을 때 `{"quantity": 3, "code_nos": [11]}` → `S00011`, `S00051`, `S00052`
- 번호가 겹칠 때: `{"code_nos": ["S00011 는 이미 있습니다."]}`

## 스풀 `spools`
```json
{
  "id": 1, "code": "S00001", "code_no": 1, "color": 1,
  "status": "open", "price": 14000,
  "purchased_at": "2026-10-20",
  "opened_at": "2026-10-20T13:33:30+09:00", "finished_at": null,
  "note": ""
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `code` | — | 스풀 코드 (`S` + 번호 5자리) |
| `code_no` | 만들 때만 | 비우면 다음 번호. 이미 있으면 400 `S00012 는 이미 있습니다.` · 만든 뒤에는 못 바꿈 (400) |
| `color` | ✅ 필수 | 색상 id |
| `status` | 선택 | `sealed`(재고) / `open`(사용 중) / `empty`(사용 완료) |
| `price` · `purchased_at` · `opened_at` · `finished_at` · `note` | 선택 | |

### 목록 `GET /api/v0/spools/?color=3&status=sealed`
- `color`(정수), `status`(`sealed` / `open` / `empty`) 로 거를 수 있다 (스풀 선택 · 조정 창). 번호 순서
- 형식이 틀리면 400: `?color=abc` → `{"color": ["유효한 정수를 입력하세요."]}`, `?status=lost` → `{"status": ["\"lost\"은 유효하지 않은 선택입니다."]}`

### 상태 바꾸기 `PATCH /api/v0/spools/{id}/`
| 보내는 것 | 동작 |
|---|---|
| `{"status": "open"}` (상태만) | 날짜 규칙 자동 적용 (PRD 3.4): 재고 → 날짜 지움 / 사용 중 → 시작일 없으면 지금, 완료일 지움 / 사용 완료 → 시작일 없으면 지금, 완료일 지금 |
| `{"status": "sealed", "opened_at": null, "finished_at": null}` (날짜 포함) | 보낸 값 그대로 저장 — 되돌리기 · 세부 조정에서 사용 |

### 그 밖
| 요청 | 설명 |
|---|---|
| `POST /api/v0/spools/` | 스풀 1개 만들기. **삭제 되돌리기**: 지운 스풀의 내용(`code_no` 포함)을 그대로 보내면 같은 코드로 다시 생김 |
| `DELETE /api/v0/spools/{id}/` | 삭제 (204) |
| `DELETE /api/v0/spools/?ids=3,4,5` | 쉼표로 구분한 id, 한 번에 100개까지 → `{"deleted": 3}`. **재고 추가 되돌리기**. 형식이 틀리거나 100개를 넘으면 400 |
| `GET /api/v0/spools/code/S00012/` | 코드로 찾기 (대소문자 무관). 형식이 틀리면 400, 없으면 404 (PRD INV-09) |

## 되돌리기 (PRD 3.5) — 화면이 하는 일
서버는 이력을 저장하지 않는다. 방금 받은 응답을 화면이 기억해 두었다가 알림의 `되돌리기`(7초)에서 반대 요청을 보낸다.

| 방금 한 동작 | 되돌리기 요청 |
|---|---|
| 재고 추가 | `DELETE /spools/?ids=…` — 응답으로 받은 스풀 id 들 |
| 상태 변경 | `PATCH /spools/{id}/` — 바꾸기 전의 `status` · `opened_at` · `finished_at` 를 함께 |
| 스풀 삭제 | `POST /spools/` — 지우기 전에 갖고 있던 스풀 내용 그대로 (`code_no` 포함) |
