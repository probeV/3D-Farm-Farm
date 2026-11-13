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
| `stock` | `PartCategory`, `Part`, `StockHistory`, `PackSet`, `PackSetLine` | v2 STOCK: 모델 · API |
| `products` | `Category`, `Subcategory`, `Product`, `ProductFilament`, `ProductPart`, `CostSetting` | 모델 · API 완료 |
| `expenses` | `Expense`, `RecurringExpense` | 모델 · API 완료 |
| `sales` | `Sale`, `SaleItem`, `SalePack` | 모델 · API · 화면 완료 (v2, 포장 줄은 API 까지) |
| `config` | — (앱 아님) 설정 · 최상위 URL | 완료 |

- **참조 방향은 한쪽으로만** (`→` = import 함):
  ```
  sales ──→ products ──→ filaments
    │           │            ↑
    └──→ stock ←┘ ───────────┘        expenses → filaments (공통 MONEY · BaseViewSet 만)
  ```
  `products` → `filaments` · `stock` (제품이 필라멘트 · 부속품 · 기본 포장 세트를 씀). `sales` → `products` · `stock` (판매 줄이 제품 · 포장재를 씀).
  `filaments` · `stock` 은 `products` · `sales` 를 import 하지 않는다 — 입출고 기록(`StockHistory.sale`)만 문자열 `'sales.Sale'` 로
  판매를 가리키고(판매를 고칠 때 차이 계산용), `stock/services.py` 는 판매 · 제품의 줄을 역참조로 읽는다.
- 화면의 `재고 관리` 메뉴는 `filaments`(필라멘트 탭)와 `stock`(부속품 · 포장 · 소모품 탭) 두 앱을 쓴다 — 앱은 화면이 아니라 데이터 묶음 단위.
  필라멘트는 스풀 단위로 따로 관리해서 `filaments` 앱 그대로 둔다.
- 제품의 부속품 바꾸기(`POST /parts/{id}/replace/`)는 제품의 줄을 바꾸는 동작이라 `products` 의 뷰다 (주소는 `/parts/` 아래 그대로).
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
- 첫 예: **`stock/services.py`** — 남은 수량은 품목 조정 · 다 씀 · 판매 저장 · 삭제 · (TBD-31) 지출 구매에서 바뀌어서,
  `move()` 하나로 남은 수량과 입출고 기록을 함께 바꾼다. 판매는 저장 후 `sync_sale()`(차이만 기록), 지우기 전 `revert_sale()`.

**조회는 뷰가, 시리얼라이저는 읽기만** — 개수 · 평균 같은 계산값은 뷰의 queryset 에서 `annotate` 로 한 번에 붙이고,
시리얼라이저의 `get_xxx()` 는 붙어 있는 값을 읽기만 한다 (객체마다 쿼리하면 N+1).
DRF 기본 추가 · 수정은 저장한 객체를 그대로 응답에 써서 이 값이 빠질 수 있다. 그런 뷰셋(필라멘트, 색상 추가)만
`create` / `partial_update` 를 직접 써서 저장 후 queryset 으로 다시 조회해 응답한다.

### 2.3 URL 규칙
- 모든 API 는 버전을 붙여 `/api/v0/` 아래. 앱마다 `urls.py`(DRF 라우터)를 두고 `config/urls.py` 에서 묶는다.
  ```python
  # config/urls.py
  path('api/v0/', include('filaments.urls')),
  path('api/v0/', include('stock.urls')),
  path('api/v0/', include('products.urls')),
  path('api/v0/', include('expenses.urls')),
  path('api/v0/', include('sales.urls')),
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

## 3. 프론트엔드 (`frontend/`)

```
frontend/src/
  api/          서버 호출 함수 + TanStack Query 훅 (filaments.ts, products.ts …)
                client.ts — fetch 공통 (/api/v0 주소, 오류 응답 → ApiError)
  pages/        사이드바 메뉴 하나 = 폴더 하나 (filaments/, products/, parts/, expenses/, settings/)
  components/   여러 화면에서 같이 쓰는 것 (Dialog, Toast, Pager, Field, Swatch, Help, LinkBadge …)
  styles/       app.css — 목업 CSS. 색상 토큰은 여기서만 정의
                products.css — 제품 원가 목업 CSS 중 app.css 에 없는 것
                stock.css · settings.css · expenses.css · sales.css — 재고 관리 · 설정 · 지출 · 판매 목업 CSS 중 위 파일들에 없는 것
  format.ts     화면 표시용 숫자 모양 (원, kg, 날짜)
  csv.ts        CSV 만들기(UTF-8 BOM) · 파일로 내려받기 (제품 원가 · 지출)
  validation.ts 입력 검증 공통 규칙 (금액, 정수 범위, 소수, 글자, 날짜) + 오류 정리 함수
  useForm.ts    폼 공통 흐름 훅: 입력 → 스키마 검사 → 저장 → 서버 오류 표시
  App.tsx       레이아웃(사이드바) + 화면 전환
  main.tsx      시작점: TanStack Query, 테마 적용
  theme.ts      테마: 시스템 / 라이트 / 다크 고르기, 고른 값은 브라우저에 기억
```
### 화면 폴더 안 (`pages/<화면>/`)
파일이 많아지면 **기능별 폴더**로 나눈다 (계층별 `components/` 폴더 하나로 모으지 않는다). 기능 폴더 이름은 PRD · 화면 명세의 묶음을 따른다.

```
pages/filaments/
  FilamentsPage.tsx    화면 진입점: 목록을 그리고, 타일 메뉴 · 대화상자를 연결
  stock.ts             재고 계산 (상태별 kg, 재고 없음 · 소진) — 여러 기능 폴더에서 씀
  BrandLogo.tsx        여러 기능 폴더에서 쓰는 작은 표시 부품
  Swatch.tsx
  list/                목록 (screens 1.2~1.4): BrandSummary(회사별 요약), FilamentCard(필라멘트 묶음 · 색상 타일), TileMenu
  spools/              스풀 동작 (PRD 3.4 · 3.5): PurchaseDialog, PickDialog, SpoolTable(스풀 조정 표),
                       spoolActions.ts(동작 + 되돌리기), schemas.ts(재고 추가 검증)
  ColorManageDialog.tsx  색상 · 스풀 관리 (TBD-13): 색상 정보 탭(catalog) + 스풀 탭(spools/SpoolTable) — 두 기능 폴더를 써서 여기에
  catalog/             회사 · 재질 · 필라멘트 · 색상 편집 (PRD 3.1): ManageDialog(필라멘트 관리),
                       BrandDialog, MaterialDialog, FilamentDialog, ColorDialog(색상 추가 + 입력칸 · 머리 띠),
                       useColorEditor.ts(색상 저장 · 삭제), schemas.ts

pages/products/
  ProductsPage.tsx     화면 진입점: 상태별 개수 · 요약 카드 · 제품 목록, 대화상자 연결
  useCostData.ts       제품 · 카테고리 · 필라멘트 · 부자재 · 설정을 함께 불러와 제품별 원가까지 (목록 · 관리 창 · 제품 창이 같이 씀)
  cost.ts              원가 계산 (PRD 3.6) — 서버는 계산하지 않음. 목록 · 미리보기 · CSV 가 모두 이것을 씀
  categories.ts        카테고리 · 세부 분류 고르기 ('c:1' / 's:2' / 'none'), status.ts · StatusBadge.tsx
  list/                목록 (screens 2.1~2.3): ProductTable, productList.ts(검색 · 필터 · 정렬 · 요약), csv.ts
  catalog/             제품 관리 · 카테고리 (PRD-11, screens 2.4): ManageDialog, CategoryDialog, schemas.ts
  form/                제품 추가 · 복제 · 수정 (screens 2.5): ProductDialog(머리 띠 · 저장), MaterialLines(재료 표),
                       CostPanel(원가 미리보기), draft.ts(처음 값 · 미리보기 값), schemas.ts

pages/stock/           재고 관리 (v2 STOCK, screens 3장). 필라멘트 탭은 pages/filaments 그대로
  StockPage.tsx        화면 진입점: 탭 필라멘트 | 부속품 | 포장 | 소모품
  ItemsTab.tsx         부속품 · 포장 · 소모품 탭 (kind 로 나눔): 개수 · 요약 카드 · (포장) 세트 카드 · 카드 / 표 목록
  kinds.ts             탭 이름 · 품목 이름 · 남은 수량 상태(부족 · 없음)
  usePartsData.ts      한 탭의 품목 · 카테고리 + 포장 세트 + 제품(부속품 줄)을 함께 (목록 · 관리 창이 같이 씀)
  partList.ts          검색 · 정렬 · 요약 · 사용하는 제품 · 구매처 고르기 · 세트 원가 · 바로 쌀 수 있는 수
  ManageDialog.tsx     ○○ 관리 (구매처 / 카테고리 → 품목, screens 3.4), PartDialog.tsx 추가 · 복제 · 수정(사진 · 입출고 기록),
                       AdjustDialog.tsx 남은 수량 조정, PackSetDialog.tsx 포장 세트, ReplaceDialog.tsx 부속품 바꾸기, schemas.ts

pages/expenses/
  ExpensesPage.tsx     화면 진입점: 요약 카드 · 반복 지출 알림 · 분류별 합계 · 지출 목록, 대화상자 연결
  categories.ts        분류 7개 (이름 · 예시 · v2 에서 쓰이는 곳), CategoryPick.tsx 분류 버튼
  expenseList.ts       기간 · 검색 · 정렬 · 요약 · 분류별 합계 · 넣을 반복 지출 · CSV
  ExpenseDialog.tsx    지출 추가 · 복제 · 수정, RecurringDialog.tsx 반복 지출 관리 (+ RecurringFormDialog.tsx),
                       DueDialog.tsx 이번 달 반복 지출 넣기, schemas.ts

pages/settings/
  SettingsPage.tsx     설정 (screens 4장): 왼쪽 분류 · 설정 묶음 · 분류별 저장 줄. schemas.ts 에 분류 · 항목 목록 · 검증 · 계산 예시
```
- 한 기능 폴더에서만 쓰는 것은 그 폴더에, 두 곳 이상에서 쓰면 화면 폴더 바로 아래에, 다른 화면에서도 쓰면 `src/components/` 로 올린다.
- 폼 검증 스키마는 그 폼이 있는 기능 폴더의 `schemas.ts` 에 둔다.

### 규칙
- 서버 데이터는 TanStack Query 로만 가져오고, 화면 안 상태(열린 창, 선택한 타일)는 컴포넌트 상태로 둔다.
- 백엔드 앱과 프론트 폴더 이름을 맞춘다: `filaments` ↔ `api/filaments.ts`, `pages/filaments/`.
- 단위 테스트(Vitest)는 대상 파일 옆에 `이름.test.ts` 로 둔다 (예: `validation.test.ts`, `pages/filaments/stock.test.ts`).
  프론트에만 있는 로직(검증 규칙 · 계산 · 표시 모양)은 테스트도 함께 추가한다. 실행: `npm test` (frontend/ 에서)
- 저장 · 삭제 뒤에는 관련 목록을 무효화해서 다시 불러온다 (`useRefreshFilaments`). 화면이 직접 목록을 고치지 않는다.
- 대화상자 위에 대화상자를 열 때는 안에 넣지 않고 옆에 그린다 (`<form>` 안에 `<form>` 이 들어가지 않도록). 나중에 연 창이 위에 뜬다.
- 알림은 열린 대화상자가 있으면 가장 위 대화상자 안에 그린다. 모달이 열려 있으면 그 바깥은 클릭할 수 없어서 `되돌리기` 를 누를 수 없기 때문.

### 3.1 입력 검증
화면(1차)에서 먼저 걸러 빨리 알려 주고, 서버(2차, 시리얼라이저)가 최종 판정한다. 화면을 거치지 않은 요청도 서버가 막는다.

| 항목 | 규칙 |
|---|---|
| 검사 방법 | 모든 폼이 같은 순서: **입력칸 글자 → Zod 스키마 `safeParse` → 성공하면 서버로 / 실패하면 오류 표시**. 폼은 이 흐름을 `useForm` 훅으로 쓴다. 브라우저 기본 검사(`required` · `min` 말풍선)는 쓰지 않는다 (`Dialog` 의 form 은 `noValidate`) |
| 규칙 위치 | 공통 규칙은 `src/validation.ts` (`money`, `intRange`, `date`), 폼 스키마는 화면 폴더의 `schemas.ts`. 같은 칸은 어느 창에서든 같은 규칙을 쓴다 (예: 구매가 = `money`) |
| 서버와 맞추기 | 규칙은 시리얼라이저 · 모델과 같게. 스키마 주석에 서버 쪽 위치를 적고, 서버 규칙을 바꾸면 함께 고친다. DB 를 봐야 아는 것(이미 있는 번호 등)은 서버만 검사 |
| 숫자 칸 | `type="text"` + `inputMode="numeric"` (`type="number"` 는 `-` 같은 글자를 빈칸으로 바꿔 넘겨서 "비움"과 구분이 안 됨). 글자 → 숫자 변환도 스키마가 한다 (빈칸 → `null`, 쉼표 허용) |
| 오류 표시 | 폼: 그 칸 아래 빨간 글씨 (`Field` 부품). 서버 400 의 칸별 메시지도 같은 자리에 (`fieldErrorsOf`). 한 번 오류가 나면 입력할 때마다 다시 검사 |
|  | 줄 목록 칸(제품의 사용 필라멘트 · 부자재): `filaments.1.grams` 처럼 "목록.순서.칸" 이름으로 그 줄 아래. 서버 400 의 `{"filaments": [{}, {"grams": [...]}]}` 도 같은 이름으로 바꾼다 |
|  | 바로 저장하는 칸(스풀 조정의 구매가처럼 줄 안에 글씨 자리가 없는 칸): 원래 값으로 되돌리고 알림 |
|  | 칸과 상관없는 오류(404 · 409 · 네트워크): 알림 |
| 문구 | 화면 문구는 `~하세요` / `~요` 체, 서버 문구는 `~입니다` 체 (docs/api.md) |
