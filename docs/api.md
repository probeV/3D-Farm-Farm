# API — 3D Farm Farm (쓰리디팜팜)

> 요구사항: [PRD.md](PRD.md) · 데이터 구조: [ERD.md](ERD.md) · 코드 구조: [architecture.md](architecture.md)

화면(React)과 서버(Django REST Framework)가 주고받는 JSON API.
개발 중에는 Vite 개발 서버가 `/api` 요청을 Django 로 넘긴다. 브라우저로 `http://127.0.0.1:8000/api/v0/` 를 열면 목록을 직접 볼 수 있다 (제품 쪽 주소는 이 목록에 안 나오므로 `/api/v0/products/` 처럼 직접 연다).

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
| 409 | 다른 데이터가 쓰고 있어서 삭제 불가 (PRD FIL-09 · PRD-11 · PART-02) | `{"detail": "필라멘트가 있어서 삭제할 수 없습니다."}` |

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
| GET · POST | `/api/v0/categories/` | 카테고리 목록(세부 분류 포함) / 추가 |
| GET · PATCH · DELETE | `/api/v0/categories/{id}/` | 카테고리 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/subcategories/` | 세부 분류 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/subcategories/{id}/` | 세부 분류 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/part-categories/` | 부자재 카테고리 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/part-categories/{id}/` | 부자재 카테고리 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/parts/` | 부자재 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/parts/{id}/` | 부자재 하나 / 수정 / 삭제 |
| POST | `/api/v0/parts/{id}/replace/` | 제품의 부자재 바꾸기 (이 부자재 → 다른 부자재) |
| GET · POST | `/api/v0/products/` | **제품 원가 화면의 제품 데이터 전부** / 제품 추가 |
| GET · PATCH · DELETE | `/api/v0/products/{id}/` | 제품 하나 / 수정 / 삭제 |
| GET · PATCH | `/api/v0/cost-setting/` | 원가 설정 (항상 1개) |
| GET · POST | `/api/v0/expenses/` | **지출 화면 데이터 전부** / 지출 추가 (목록을 보내면 여러 줄 한 번에) |
| GET · PATCH · DELETE | `/api/v0/expenses/{id}/` | 지출 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/recurring-expenses/` | 반복 지출 목록 / 추가 |
| GET · PATCH · DELETE | `/api/v0/recurring-expenses/{id}/` | 반복 지출 하나 / 수정 / 삭제 |
| GET · POST | `/api/v0/sales/` | **판매 화면 데이터 전부** (제품 줄 · 합계 포함) / 판매 추가 |
| GET · PATCH · DELETE | `/api/v0/sales/{id}/` | 판매 하나 / 수정 / 삭제 |

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

- 삭제: 색상이 있으면 409 `색상이 있어서 삭제할 수 없습니다.`, 제품에서 쓰면 409 `제품에서 쓰고 있어서 삭제할 수 없습니다.`
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

- 삭제: 막는 것 없음 (204). 그 색상의 스풀도 함께 삭제되고, 제품에서 쓰던 줄은 `color: null`(색상 선택 안 함)이 되어 필라멘트 가격으로 계산된다 (PRD FIL-09).
  지우기 전 확인 창의 스풀 개수는 `counts`, "쓰는 제품" 목록은 화면이 제품 목록(`filaments[].color`)에서 찾는다

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

---

# 제품 원가

제품 원가 화면은 **제품 목록 + 필라멘트 목록(`/filaments/`) + 부자재 목록 + 원가 설정** 으로 그린다.
원가 · 순이익 · 순마진율 · 권장 판매가 · 입력 필요 · 요약 · 정렬 · CSV 는 화면에서 계산한다 (PRD 3.6 원가 계산 규칙).
입력 중 미리보기(PRD-07)도 같은 계산을 쓰므로 서버에 따로 두지 않는다.

## 카테고리 `categories`
```json
{
  "id": 1, "name": "수업 교구", "product_count": 3,
  "subcategories": [{ "id": 1, "category": 1, "name": "수학", "product_count": 2 }]
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `name` | ✅ 필수 | 중복 불가 → 400 `이미 있는 카테고리 이름입니다.` |
| `product_count` | — | 이 카테고리의 제품 수 (세부 분류에 있는 제품 포함) |
| `subcategories` | — | 세부 분류 목록 (이름순). 추가 · 수정 · 삭제는 `subcategories` 주소로 |

- 삭제: 제품이 있으면(세부 분류에만 있어도) 409 `제품이 있어서 삭제할 수 없습니다.` · 제품이 없으면 세부 분류도 함께 삭제
- 목록 순서: 이름순

## 세부 분류 `subcategories`
```json
{ "id": 1, "category": 1, "name": "수학", "product_count": 2 }
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `category` | ✅ 만들 때만 | 카테고리 id. 만든 뒤에는 못 바꿈 → 400 `세부 분류의 카테고리는 바꿀 수 없습니다.` |
| `name` | ✅ 필수 | 같은 카테고리 안에서 중복 → 400 `이 카테고리에 같은 이름의 세부 분류가 이미 있습니다.` |
| `product_count` | — | 이 세부 분류의 제품 수 |

- 삭제: 제품이 있으면 409 `제품이 있어서 삭제할 수 없습니다.`

## 부자재 `parts`
```json
{
  "id": 1, "name": "네오디뮴 자석 6×3mm", "category": 1, "shop": "", "buy_url": "https://…",
  "price": 12000, "pack_qty": 200, "unit": "개",
  "unit_price": 60.0, "note": "", "product_count": 2
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `name` | ✅ 필수 | 품목. 중복 불가 → 400 `이미 있는 품목입니다.` |
| `category` | 선택 | 부자재 카테고리 id. `null` = 미분류 |
| `shop` · `note` | 선택 | 회사/구매처, 메모 |
| `buy_url` | 선택 | 구매 링크 (최대 500자). 주소 형식이 아니면 400 `https:// 로 시작하는 주소로 입력하세요.` |
| `price` | 선택 | 묶음 구매가. `null` = 미입력 (원가에서 0원 + 경고) |
| `pack_qty` | 선택 | 묶음 수량, 기본 1. 0 보다 커야 함 |
| `unit` | 선택 | 단위, 기본 `개` |
| `unit_price` | — | 개당 단가 = `price ÷ pack_qty` (소수 2자리). 가격이 없으면 `null` |
| `product_count` | — | 이 부자재를 쓰는 제품 수 |

- 삭제: 제품에서 쓰면 409 `제품에서 쓰고 있어서 삭제할 수 없습니다.`
- 목록 순서: 품목 이름순
- 부자재 화면의 사용하는 제품 목록 · 제품당 평균 부자재비는 제품 목록(`/products/`)의 `parts` 줄로 화면에서 계산한다

### 제품의 부자재 바꾸기 `POST /api/v0/parts/{id}/replace/`
```json
{ "to": 9, "products": [1, 3] }
```
- 제품에서 쓰는 이 부자재 줄을 `to` 로 바꾼다. `products` 를 빼면 이 부자재를 쓰는 제품 전부
- 수량은 그대로. 그 제품에 이미 `to` 줄이 있으면 수량을 더해 한 줄로
- 한 번에 처리 (하나라도 실패하면 아무것도 바꾸지 않음). 부자재 자체는 지우거나 바꾸지 않는다
- 응답 200 `{"replaced": 2}` (바꾼 제품 수)
- 400: `to` 가 자기 자신 `다른 부자재를 고르세요.` · 없는 id `없는 부자재입니다.` / `products` 에 이 부자재를 안 쓰는 제품 `이 부자재를 쓰는 제품을 고르세요.`

## 부자재 카테고리 `part-categories`
```json
{ "id": 1, "name": "부품", "part_count": 4 }
```
- `name` 필수, 중복 → 400 `이미 있는 카테고리 이름입니다.`. `part_count` 는 이 카테고리의 부자재 수
- 삭제: 막는 것 없음 (204). 그 부자재는 `category: null`(미분류)
- 처음에는 `부품` · `포장재` · `기타` (마이그레이션이 만든다). 목록 순서: 이름순

## 제품 `products`
```json
{
  "id": 1, "no": 1,
  "category": 1, "subcategory": 1,
  "name": "분수 원판 세트", "status": "on_sale",
  "print_minutes": 200, "sale_price": 18900, "note": "",
  "filaments": [
    { "id": 1, "filament": 1, "color": 101, "grams": 24.37 },
    { "id": 2, "filament": 4, "color": null, "grams": 60 }
  ],
  "parts": [{ "id": 1, "part": 1, "qty": 12 }],
  "created_at": "2026-10-22T13:00:00+09:00", "updated_at": "2026-10-22T13:00:00+09:00"
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `no` | 선택 | No. (1 이상). 비우면 지금 가장 큰 번호 + 1. 중복 → 400 `No. 3 는 이미 있습니다.` |
| `category` · `subcategory` | 선택 | id, `null` = 미분류 / 세부 분류 없음. 세부 분류는 그 카테고리 안의 것만 → 400 (`subcategory` 칸에 `세부 분류는 고른 카테고리 안에서 골라야 합니다.`) |
| `name` | ✅ 필수 | 제품명 |
| `status` | 선택 | `on_sale`(판매중) / `developing`(개발중, 기본) / `discontinued`(판매중지) |
| `print_minutes` | 선택 | 출력 시간(분, 정수). `null` = 미입력 |
| `sale_price` | 선택 | 판매가. `null` = 미입력 |
| `note` | 선택 | 메모 |
| `filaments` | 선택 | 사용 필라멘트 줄 `{filament, color, grams}`. `color` 는 선택(`null`), 그 필라멘트의 색상만 → 400 (`filaments[i].color`). `grams` 0 이상, 소수 2자리까지 |
| `parts` | 선택 | 사용 부자재 줄 `{part, qty}`. `qty` 0 이상 |

- **줄 저장**: `filaments` · `parts` 를 보내면 그 목록으로 통째로 바꾼다 (기존 줄을 지우고 새로 만들어서 줄 `id` 가 바뀐다).
  보내지 않으면 줄은 그대로 (`PATCH {"status": "discontinued"}` 처럼). 하나라도 틀리면 400, 아무것도 바뀌지 않음
- **복제** (PRD-04a): 서버 기능 없음. 화면이 원본을 복사해 추가 창에 채우고(`no` 는 비우거나 다음 번호, 이름 `(복사)`, 상태 `developing`) 저장할 때 `POST /products/`
- 삭제: 줄도 함께 삭제 (204). 팔린 적 있는 제품도 지울 수 있다 — 판매 줄은 남고 `product: null`, 팔 때 저장한 `product_name` 으로 보인다
- 목록 순서: No. 순 (숫자 순서)

### 화면에서 계산하는 값 (참고)
```
줄의 g당 가격 = (색상.price ?? 필라멘트.price) ÷ 필라멘트.spool_g      ← color 가 null 이면 필라멘트.price
             (색상.spool_price · price_per_g 가 이미 이 값. /filaments/ 의 colors 에 있음)
부자재비      = Σ qty × 부자재.unit_price
그 밖 원가 · 순이익 · 순마진율 · 권장 판매가 = PRD 3.6 원가 계산 규칙 (설정값은 cost-setting)
목록 색상     = filaments[].color 를 중복 없이 → 색상의 hex 로 동그라미
```

## 원가 설정 `cost-setting`
항상 1개라서 id 없이 주소 하나 (`GET` · `PATCH`, 처음 읽을 때 기본값으로 만들어짐). 바꾸면 모든 제품 원가에 바로 반영 (화면 계산).
```json
{
  "power_kw": 0.36, "elec_rate": 215, "fee_order": 1.98, "fee_sales": 2.73, "shipping_cost": 0, "target_margin": 40
}
```
| 칸 | 설명 (PRD 3.8) |
|---|---|
| `power_kw` | 프린터 소비 전력(kW). 0 이상, 소수 3자리 |
| `elec_rate` | 전기료 단가(원/kWh). 0 이상, 소수 1자리 |
| `fee_order` · `fee_sales` · `target_margin` | % 숫자 그대로 (`1.98` = 1.98%), 0 ~ 100, 소수 2자리 |
| `shipping_cost` | 건당 판매자 부담 배송비. 0 이상 정수 |

- `PUT` · `DELETE` 는 405
- 프린터 구매가 · 예상 수명 · 출력 실패율(`printer_price` · `printer_life_hours` · `failure_rate`)은 뺐다 (PRD 3.8). 보내도 무시한다

---

# 지출

지출 화면 = 지출 목록 + 반복 지출 (PRD 3.10). 요약 · 분류별 합계 · 기간 필터 · 이번 달에 넣을 반복 지출 · CSV 는 화면이 계산한다.
분류(`category`)는 고정 7개: `invest`(투자(장비)) · `filament`(필라멘트) · `part`(부자재) · `supply`(소모품 · 유지) · `sub`(구독 · 운영) · `sell`(판매비) · `etc`(기타). 다른 값은 400 `없는 분류입니다.`

## 지출 `expenses`
```json
{
  "id": 1, "date": "2026-10-05", "name": "AI 구독", "category": "sub", "amount": 29000,
  "shop": "", "url": "", "note": "", "recurring": 1
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `date` | 선택 | 지출 날짜, 기본 오늘. 오늘 이후면 400 `오늘 이후 날짜는 넣을 수 없습니다.` |
| `name` | ✅ 필수 | 항목 (최대 100자) |
| `category` | ✅ 필수 | 분류 (위 7개) |
| `amount` | ✅ 필수 | 금액. 1 이상 정수 |
| `shop` · `note` | 선택 | 구매처, 메모 |
| `url` | 선택 | 주문 링크 (최대 500자). 주소 형식이 아니면 400 `https:// 로 시작하는 주소로 입력하세요.` |
| `recurring` | 선택 | 반복 지출에서 넣은 줄이면 그 id. 같은 반복 지출을 같은 달에 또 넣으면 400 `{"recurring": ["이 달에 이미 넣은 반복 지출입니다."]}` |

- 목록 순서: 날짜 최근순 (같은 날이면 나중에 넣은 것 먼저)
- **여러 줄 한 번에** (이번 달 반복 지출 넣기): `POST /api/v0/expenses/` 에 목록 `[{...}, {...}]` 을 보내면 201 + 만든 지출 목록.
  하나라도 틀리면 아무것도 넣지 않는다 (400 은 줄마다 `[{}, {"category": [...]}]`). 같은 반복 지출을 한 번에 같은 달로 두 줄 보내도 400
- 삭제: 막는 것 없음 (204)

## 반복 지출 `recurring-expenses`
```json
{ "id": 1, "name": "AI 구독", "category": "sub", "amount": 29000, "day": 5, "start": "2026-06-01", "note": "", "expense_count": 5 }
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `name` · `category` · `amount` | ✅ 필수 | 이름, 분류, 금액(1 이상 정수) |
| `day` | ✅ 필수 | 결제일 1 ~ 31. 그 달 말일보다 크면 말일로 넣는다 (화면 계산) |
| `start` | ✅ 필수 | 시작 달. 아무 날짜나 보내도 그 달 1일로 저장 (`2026-06-17` → `2026-06-01`) |
| `note` | 선택 | 메모 |
| `expense_count` | — | 이 반복에서 넣은 지출 수 |

- 목록 순서: 결제일순 → 이름순
- 지출을 저절로 만들지 않는다. 화면이 "결제일이 지났는데 이번 달에 안 넣은 것"을 보여 주고, 확인하면 위의 여러 줄 추가로 넣는다
- 삭제: 막는 것 없음 (204). 이미 넣은 지출은 남고 `recurring` 이 `null` 이 된다. 해지 달은 없다 (그만 낼 때는 삭제)

## 판매 `sales`
```json
{
  "id": 22, "date": "2026-10-23", "channel": "store", "order_no": "2026102389012",
  "items": [
    { "id": 41, "product": 1, "product_name": "분수 원판 세트", "qty": 2, "unit_price": 18900, "unit_cost": 3227, "amount": 37800 },
    { "id": 42, "product": 4, "product_name": "이름 키링", "qty": 1, "unit_price": 4900, "unit_cost": 191, "amount": 4900 }
  ],
  "shipping_received": 0, "fee": 2011, "shipping_cost": 3300, "note": "",
  "gross": 42700, "settle": 40689, "cost": 6645, "profit": 30744,
  "created_at": "2026-10-23T05:12:00Z"
}
```
| 칸 | 쓰기 | 설명 |
|---|---|---|
| `date` | 선택 | 판매 날짜, 기본 오늘. 오늘 이후면 400 `오늘 이후 날짜는 넣을 수 없습니다.` |
| `channel` | 선택 | 판매처 `store`(스마트스토어, 기본) · `direct`(직접 판매) · `etc`(기타). 그 밖이면 400 `없는 판매처입니다.` |
| `order_no` | 선택 | 주문번호 (최대 50자, 앞뒤 공백 제거). 비어 있지 않은데 이미 있으면 400 `이미 넣은 주문번호입니다.` 빈 값은 여러 개 가능 |
| `items` | ✅ 필수 | 제품 줄 `{product, product_name, qty, unit_price, unit_cost}`. 비어 있으면 400 `제품을 한 개 이상 넣으세요.` |
| `items[].product` | 선택 | 제품 id. 제품을 지운 줄이면 `null` — 이때는 `product_name` 이 있어야 함 (둘 다 없으면 400 `제품을 고르세요.`) |
| `items[].product_name` | 선택 | 팔 때의 제품명. 비우면 제품 이름을 복사. 수정할 때는 받은 이름을 그대로 보내면 팔 때 이름이 유지된다 |
| `items[].qty` | ✅ 필수 | 수량, 1 이상 정수 |
| `items[].unit_price` | ✅ 필수 | 단가 (0 이상 정수). 화면이 제품 판매가를 기본값으로 |
| `items[].unit_cost` | 선택 | 개당 원가 (SALE-05). 화면이 저장할 때 원가 계산표 값을 원 단위로 반올림해서 보낸다. `null` = 원가 없음 |
| `shipping_received` | 선택 | 손님이 낸 배송비, 기본 0 |
| `fee` | 선택 | 수수료. **추가할 때 보내지 않으면** 스마트스토어는 자동 계산(아래), 직접 판매 · 기타는 0. 보내면 그 값 그대로 (고친 수수료) |
| `shipping_cost` | 선택 | 판매자가 낸 택배비 (주문별 이익 참고용), 기본 0. 화면이 설정의 SET-08 을 기본값으로 |
| `note` | 선택 | 메모 |
| `items[].amount` · `gross` · `settle` · `cost` · `profit` | — | 판매가(단가 × 수량) · 판매가 합계 · 정산 금액 · 원가 합계 · 주문별 이익. 원가 없는 줄이 있으면 `cost` · `profit` 은 `null` |

- **줄 저장**: `items` 를 보내면 그 목록으로 통째로 바꾼다 (줄 `id` 가 바뀐다). 보내지 않으면 줄은 그대로 (`PATCH {"note": "..."}`).
  하나라도 틀리면 400, 아무것도 바뀌지 않음
- **수수료는 수정할 때 다시 계산하지 않는다** — 화면이 판매가 · 배송비를 바꾸면 새 수수료를 함께 보낸다 (`다시 계산`)
- 삭제: 줄도 함께 삭제 (204)
- 목록 순서: 날짜 최근순 (같은 날이면 나중에 넣은 것 먼저)

### 계산 (참고)
```
판매가 합계 gross   = Σ items.unit_price × qty
수수료 (자동)       = (gross + shipping_received) × (원가 설정 fee_order + fee_sales)%, 원 단위 반올림
정산 금액 settle    = gross + shipping_received − fee
주문별 이익 profit  = settle − Σ items.unit_cost × qty − shipping_cost   (원가 없는 줄이 있으면 null)
```
