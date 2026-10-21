# 코드 구조 — 3D Farm Farm (쓰리디팜팜)

> 요구사항: [PRD.md](PRD.md) · 데이터 구조: [ERD.md](ERD.md) · 화면: [screens.md](screens.md)

새 기능을 추가할 때 "무엇을 어디에 두는지" 정한 규칙.

## 1. 전체 구조

Django 의 MTV 중 **T(Template) 자리를 React 가 맡는다.** Django 는 데이터(JSON API)만 주고, 화면은 React 가 그린다.
예외로 Django 관리자(`/admin`)는 Django 가 직접 그린다.

```
frontend/ (React)                          backend/ (Django)
  화면 ──fetch──▶ /api/... ──▶ urls.py ─▶ views.py ─▶ serializers.py ─▶ models.py ─▶ SQLite
```
- 개발 중에는 Vite 개발 서버가 `/api` · `/admin` · `/static` · `/media` 를 Django 로 넘긴다 (`frontend/vite.config.ts`).
- 사용할 때는 React 빌드 결과를 Django 가 함께 제공해 서버 하나로 실행한다 (PRD SYS-04, 구현 예정).

## 2. 백엔드 (`backend/`)

### 2.1 Django 앱 나누기
화면이 아니라 **데이터 묶음(도메인)** 단위로 앱을 나눈다. ERD 의 앱 구성을 따른다.

| 앱 | 모델 | 상태 |
|---|---|---|
| `filaments` | `Brand`, `Material`, `Filament`, `Color`, `Spool` | 모델 완료 |
| `products` | `Part`, `Product`, `ProductFilament`, `ProductPart`, `CostSetting` | 예정 |
| `config` | — (앱 아님) 설정 · 최상위 URL | 완료 |

- **참조 방향은 한쪽으로만**: `products` → `filaments` (제품이 필라멘트를 씀). `filaments` 는 `products` 를 import 하지 않는다.
- 부자재(`Part`)는 제품 원가에서만 쓰여서 `products` 에 둔다. 따로 커지면 그때 `parts` 앱으로 분리한다.
- 새 앱: `backend/` 에서 `python manage.py startapp <앱>` → `config/settings.py` 의 `INSTALLED_APPS` 에 추가.

### 2.2 앱 안의 파일 역할
| 파일 | 넣는 것 | 넣지 않는 것 |
|---|---|---|
| `models.py` | 필드, 제약 조건, **모델 하나로 끝나는 규칙** (예: 색상 코드 정리, 스풀 번호 매기기, 상태 변경 날짜 규칙, g당 가격) | 다른 모델까지 바꾸는 동작 |
| `serializers.py` | 모델 ↔ JSON 변환, 입력 검사 | 비즈니스 규칙 (모델을 부른다), **응답용 조회 쿼리** |
| `views.py` | DRF API. 요청 받기 → 시리얼라이저로 검사 → 저장 · 동작 → 응답. **응답에 쓸 데이터 조회**(`queryset`, `annotate`). **여러 행을 함께 바꾸는 동작**은 그 API 의 `@action` 에 `@transaction.atomic` 으로 (예: 재고 N개 추가) | 모델 하나로 끝나는 규칙 (모델에) |
| `urls.py` | 그 앱의 API 주소 | — |
| `admin.py` | 관리자 화면 등록 | — |
| `tests.py` | 그 앱의 테스트 | — |
| `migrations/` | `makemigrations` 가 만든 파일. 손으로 고치지 않는다 | — |

판단이 애매하면: **"HTTP 없이 셸(`manage.py shell`)에서도 똑같이 동작해야 하는가?"** → 그렇다면 `models.py`.

**서비스 계층(`services.py`)은 두지 않는다** — 지금은 여러 행을 바꾸는 동작이 API 하나에서만 쓰여서 뷰에 둔다.
같은 동작을 여러 API 에서 쓰게 되면(예: QR 스캔 등록) 그때 `services.py` 로 뺀다.

**조회는 뷰가, 시리얼라이저는 읽기만** — 개수 · 평균 같은 계산값은 뷰의 queryset 에서 `annotate` 로 한 번에 붙이고,
시리얼라이저의 `get_xxx()` 는 붙어 있는 값을 읽기만 한다 (객체마다 쿼리하면 N+1).
DRF 기본 추가 · 수정은 저장한 객체를 그대로 응답에 써서 이 값이 빠질 수 있다. 그런 뷰셋(필라멘트, 색상 추가)만
`create` / `partial_update` 를 직접 써서 저장 후 queryset 으로 다시 조회해 응답한다.

### 2.3 URL 규칙
- 모든 API 는 버전을 붙여 `/api/v0/` 아래. 앱마다 `urls.py`(DRF 라우터)를 두고 `config/urls.py` 에서 묶는다.
  ```python
  # config/urls.py
  path('api/v0/', include('filaments.urls')),
  path('api/v0/', include('products.urls')),
  ```
- 주소 · 응답 모양이 바뀌는 변경은 `v1` 을 새로 만들고 `v0` 는 그대로 둔다. 칸을 추가하는 정도는 같은 버전에서
- 주소는 복수형 명사: `/api/v0/brands/`, `/api/v0/filaments/`, `/api/v0/colors/{id}/`, `/api/v0/spools/`
- URL 에는 동사를 넣지 않고 명사(자원)로, 동작은 HTTP 메서드로 표현한다. 기본 5개 밖의 요청은 하위 자원으로:
  `POST /api/v0/colors/{id}/spools/` (이 색상에 스풀 만들기 = 재고 추가), `GET /api/v0/spools/code/{code}/` (코드로 찾기)
  - 여러 개 삭제는 목록 주소에 DELETE: `DELETE /api/v0/spools/?ids=3,4,5`. DRF 기본 라우터에 없어서
    `filaments/urls.py` 의 `Router` 가 목록 주소의 DELETE 를 `bulk_destroy` 에 연결한다
- 엔드포인트 목록과 요청 · 응답 모양은 [api.md](api.md)

### 2.4 파일이 커지면
- 한 파일이 대략 400줄을 넘거나 성격이 다른 것이 섞이면 **같은 이름의 폴더(패키지)** 로 나눈다. 바깥에서 import 하는 경로는 그대로 유지.
  ```
  models.py            →  models/__init__.py   (from .spool import Spool ... 로 다시 내보냄)
                          models/brand.py
                          models/spool.py
  tests.py             →  tests/test_models.py, tests/test_api.py   (filaments 는 이미 이렇게 나눔)
  ```
- 처음부터 나누지는 않는다. 커졌을 때 나눈다.

### 2.5 공통 규칙
- 금액 · 무게 · 수량은 `DecimalField` (ERD 참고 사항)
- 화면에 보이는 이름은 한국어 `verbose_name` 으로 (관리자 화면에 그대로 나옴)
- 모델 · 서비스를 추가하면 테스트도 함께: `python manage.py test` (backend/ 에서)
- 코드 모양은 Ruff · Prettier 가 맞춘다. 실행 방법은 README 의 "코드 스타일"

## 3. 프론트엔드 (`frontend/`) — 안(案)

필라멘트 화면을 만들 때 확정한다.

```
frontend/src/
  api/          서버 호출 함수 + TanStack Query 훅 (filaments.ts, products.ts …)
                client.ts — fetch 공통 (/api/v0 주소, 오류 응답 → ApiError)
  pages/        사이드바 메뉴 하나 = 폴더 하나 (filaments/, products/, parts/, settings/)
                화면에서만 쓰는 계산은 그 폴더에 (예: filaments/stock.ts — 상태별 kg, 재고 없음 · 소진)
  components/   여러 화면에서 같이 쓰는 것 (Dialog, Toast, Pager …)
  styles/       app.css — 목업 CSS. 색상 토큰은 여기서만 정의
  format.ts     화면 표시용 숫자 모양 (원, kg)
  App.tsx       레이아웃(사이드바) + 화면 전환
  main.tsx      시작점: TanStack Query, 테마(시스템 설정 따름)
```
- 서버 데이터는 TanStack Query 로만 가져오고, 화면 안 상태(열린 창, 선택한 타일)는 컴포넌트 상태로 둔다.
- 백엔드 앱과 프론트 폴더 이름을 맞춘다: `filaments` ↔ `api/filaments.ts`, `pages/filaments/`.
