# ERD — 3D Farm Farm (쓰리디팜팜)

> 요구사항: [PRD.md](PRD.md) · DB: SQLite (Django ORM)

## 다이어그램

```mermaid
erDiagram
    BRAND ||--o{ FILAMENT : "필라멘트"
    MATERIAL ||--o{ FILAMENT : "재질"
    FILAMENT ||--o{ COLOR : "색상"
    COLOR ||--o{ SPOOL : "스풀"
    CATEGORY ||--o{ SUBCATEGORY : "세부 분류"
    CATEGORY |o--o{ PRODUCT : "카테고리"
    SUBCATEGORY |o--o{ PRODUCT : "세부 분류"
    PRODUCT ||--o{ PRODUCT_FILAMENT : "사용 필라멘트"
    FILAMENT ||--o{ PRODUCT_FILAMENT : "사용됨"
    COLOR |o--o{ PRODUCT_FILAMENT : "사용 색상"
    PRODUCT ||--o{ PRODUCT_PART : "사용 부자재"
    PART ||--o{ PRODUCT_PART : "사용됨"
    PART_CATEGORY |o--o{ PART : "카테고리"
    RECURRING_EXPENSE |o--o{ EXPENSE : "넣은 지출"
    SALE ||--o{ SALE_ITEM : "판매 제품"
    PRODUCT |o--o{ SALE_ITEM : "팔린 제품"

    BRAND {
        bigint id PK
        varchar name UK "회사 이름"
        varchar logo "대표 이미지 파일 경로 (media/brands/), 빈 값 허용"
    }
    MATERIAL {
        bigint id PK
        varchar name UK "재질 이름 (PLA, PETG-CF ...)"
    }
    FILAMENT {
        bigint id PK
        bigint brand_id FK
        bigint material_id FK
        varchar series "시리즈 (Basic, Matte ...), 빈 값 허용"
        decimal price "기본 스풀 가격, NULL=미입력"
        decimal spool_g "스풀 무게(g), 기본 1000"
    }
    COLOR {
        bigint id PK
        bigint filament_id FK
        varchar name "색상 이름 (필라멘트 안에서 UK)"
        varchar hex "색상 코드 #RRGGBB"
        decimal price "색상 가격, NULL=필라멘트 가격"
    }
    SPOOL {
        bigint id PK
        bigint color_id FK
        int code_no UK "스풀 번호. 코드 = S + 5자리 (S00012)"
        varchar status "sealed / open / empty"
        decimal price "실제 구매가"
        date purchased_at "구매일"
        datetime opened_at "사용 시작일"
        datetime finished_at "사용 완료일"
        text note
    }
    PART_CATEGORY {
        bigint id PK
        varchar name UK "부자재 카테고리 이름"
    }
    PART {
        bigint id PK
        varchar name UK "품목"
        bigint category_id FK "NULL=미분류"
        varchar shop "회사/구매처"
        varchar buy_url "구매 링크, 빈 문자열=없음"
        decimal price "묶음 구매가, NULL=미입력"
        decimal pack_qty "묶음 수량, 기본 1"
        varchar unit "단위, 기본 개"
        text note
    }
    CATEGORY {
        bigint id PK
        varchar name UK "카테고리 이름"
    }
    SUBCATEGORY {
        bigint id PK
        bigint category_id FK
        varchar name "세부 분류 이름 (카테고리 안에서 UK)"
    }
    PRODUCT {
        bigint id PK
        int no UK "No. 1, 2, 3 ... 비우면 다음 번호"
        bigint category_id FK "NULL=미분류"
        bigint subcategory_id FK "NULL=세부 분류 없음"
        varchar name
        int print_minutes "출력 시간(분), NULL=미입력"
        decimal sale_price "판매가, NULL=미입력"
        varchar status "on_sale / developing / discontinued"
        text note
        datetime created_at
        datetime updated_at
    }
    PRODUCT_FILAMENT {
        bigint id PK
        bigint product_id FK
        bigint filament_id FK
        bigint color_id FK "NULL=색상 선택 안 함"
        decimal grams "사용량(g) 소수 2자리"
    }
    PRODUCT_PART {
        bigint id PK
        bigint product_id FK
        bigint part_id FK
        decimal qty "수량"
    }
    EXPENSE {
        bigint id PK
        date date "지출 날짜 (오늘 이후 불가)"
        varchar name "항목"
        varchar category "invest / filament / part / supply / sub / sell / etc"
        decimal amount "금액 (1원 이상)"
        varchar shop "구매처, 빈 값 허용"
        varchar url "주문 링크, 빈 값 허용"
        text note
        bigint recurring_id FK "반복 지출에서 넣은 줄, NULL=직접 입력"
        datetime created_at
    }
    RECURRING_EXPENSE {
        bigint id PK
        varchar name
        varchar category "EXPENSE.category 와 같은 7개"
        decimal amount "금액 (1원 이상)"
        smallint day "결제일 1~31"
        date start "시작 달 (항상 1일)"
        text note
    }
    SALE {
        bigint id PK
        date date "판매 날짜"
        varchar channel "store / direct / etc"
        varchar order_no "주문번호, 빈 값 허용 (비어 있지 않으면 UNIQUE)"
        decimal shipping_received "손님이 낸 배송비"
        decimal fee "수수료"
        decimal shipping_cost "판매자가 낸 택배비 (주문별 이익 참고용)"
        text note
        datetime created_at
    }
    SALE_ITEM {
        bigint id PK
        bigint sale_id FK
        bigint product_id FK "NULL=제품을 지움"
        varchar product_name "팔 때의 제품명"
        int qty "수량 (1 이상)"
        decimal unit_price "단가"
        decimal unit_cost "팔 때 복사한 개당 원가, NULL=원가 없음"
    }
    COST_SETTING {
        bigint id PK "항상 1개 행"
        decimal power_kw
        decimal elec_rate
        decimal fee_order
        decimal fee_sales
        decimal shipping_cost
        decimal target_margin
    }
```

## Django 앱 구성 (안)
| 앱 | 모델 |
|---|---|
| `filaments` | `Brand`, `Material`, `Filament`, `Color`, `Spool` |
| `products` | `Category`, `Subcategory`, `PartCategory`, `Part`, `Product`, `ProductFilament`, `ProductPart`, `CostSetting` |
| `expenses` | `Expense`, `RecurringExpense` |
| `sales` | `Sale`, `SaleItem` |

## 모델 설명

| 모델 | 설명 |
|---|---|
| `Brand` | 필라멘트 회사 (Bambu Lab, Esun …). 대표 이미지는 `ImageField` — 파일은 `media/brands/`, DB 에는 경로만 |
| `Material` | 재질 종류. 회사와 상관없는 공통 목록 (PLA, PETG, PETG-CF …) |
| `Filament` | 회사 + 재질 + 시리즈 단위의 필라멘트 제품. 기본 스풀 가격·무게 |
| `Color` | 필라멘트 안의 색상. 색상 코드(hex)를 가지며, 가격을 비우면 필라멘트 가격을 따름. 재고는 색상 단위로 셈 |
| `Spool` | 스풀 1개 = 1행. 스풀 번호, 상태, 날짜, 실제 구매가 |
| `PartCategory` | 부자재 카테고리 (부품, 포장재 …). 처음 3개는 마이그레이션이 만든다 |
| `Part` | 부자재. `price ÷ pack_qty` 가 개당 단가. 카테고리 · 구매 링크는 선택 |
| `Category` | 제품 카테고리 (수업 교구, 퍼즐 …) |
| `Subcategory` | 카테고리 안의 세부 분류 (수업 교구 › 수학 …). 선택 |
| `Product` | 판매 제품. 카테고리 · 세부 분류는 비워도 됨 (미분류) |
| `ProductFilament` | 제품 ↔ 필라멘트 (다대다) + 사용량 + 색상(선택). 같은 필라멘트를 색상별로 여러 줄 둘 수 있음 |
| `ProductPart` | 제품 ↔ 부자재 (다대다) + 수량 |
| `CostSetting` | 원가 계산 설정값. 항상 1개 행만 존재 (기본값은 PRD 3.8) |
| `Expense` | 지출 한 줄 (PRD 3.10). 분류는 고정 7개 (`ExpenseCategory`) |
| `RecurringExpense` | 반복 지출 (구독 · 월정액). 지출을 저절로 만들지 않고, 화면에서 확인하고 넣는다 |
| `Sale` | 판매 한 건 = 주문 하나 (v2 SALE). 판매처는 고정 3개 (`SaleChannel`). 배송비 · 수수료는 주문 단위 |
| `SaleItem` | 판매 안의 제품 한 줄. 단가 · 수량 · 팔 때 복사한 개당 원가 · 제품명 |

## 계산 규칙
```
필라멘트 표시 이름 = "{Brand.name} › {Material.name} {Filament.series}"   예: Bambu Lab › PLA Matte

색상의 스풀 가격 = Color.price 가 있으면 그 값, 없으면 Filament.price
g당 가격        = 색상의 스풀 가격 ÷ Filament.spool_g

제품 필라멘트비 (PRD 3.6) = Σ ProductFilament.grams × g당 가격
  g당 가격은 ProductFilament.color 가 있으면 그 색상 기준, 없으면 Filament.price ÷ Filament.spool_g

회사별 무게 (PRD SUM-04)
  상태별 kg = 그 상태 스풀 수 × Filament.spool_g ÷ 1000   (필라멘트마다 계산해서 합산)
  (재고 / 사용 중 / 사용 완료 각각 표시, 비율 막대는 세 값의 비율)

보유 스풀 평균 구매가 (PRD INV-08) = 재고 + 사용 중 스풀의 Spool.price 평균

반복 지출 결제일 (PRD EXP-04) = 그 달의 RecurringExpense.day, 그 달 말일보다 크면 말일 (RecurringExpense.pay_date)
이번 달에 넣을 반복 지출 = 시작 달 ≤ 이번 달 이고, 이번 달 결제일 ≤ 오늘 이고, 이번 달에 그 반복에서 넣은 지출이 없는 것
누적 투자금 (PRD EXP-05) = category 가 invest 인 Expense.amount 합계 (전체 기간)

판매가 합계 (v2 SALE-01) = Σ SaleItem.unit_price × qty
스마트스토어 수수료 (SALE-03) = (판매가 합계 + Sale.shipping_received) × (CostSetting.fee_order + fee_sales)%, 원 단위 반올림 (Sale.store_fee)
  직접 판매 · 기타는 0 (있으면 직접 입력). 고친 수수료는 그대로 저장
정산 금액 = 판매가 합계 + shipping_received − fee
주문별 이익 (SALE-05, 참고) = 정산 금액 − Σ SaleItem.unit_cost × qty − shipping_cost. unit_cost 가 NULL 인 줄이 있으면 이익 없음
```

## 관계와 삭제 규칙
| 관계 | on_delete | 의미 |
|---|---|---|
| `Filament.brand` → `Brand` | PROTECT | 필라멘트가 있으면 회사 삭제 불가 |
| `Filament.material` → `Material` | PROTECT | 필라멘트가 있으면 재질 삭제 불가 |
| `Color.filament` → `Filament` | PROTECT | 색상이 있으면 필라멘트 삭제 불가 |
| `Spool.color` → `Color` | CASCADE | 색상을 지우면 그 색상의 스풀도 함께 삭제. 지우기 전에 스풀 개수를 알려 주고 2차 확인 |
| `ProductFilament.filament` → `Filament` | PROTECT | 제품에서 쓰면 필라멘트 삭제 불가 |
| `ProductPart.part` → `Part` | PROTECT | 제품에서 쓰면 부자재 삭제 불가 |
| `Part.category` → `PartCategory` | SET_NULL | 카테고리를 지우면 그 부자재는 미분류 (원가는 그대로). 부자재가 있으면 화면에서 2차 확인 |
| `ProductFilament.color` → `Color` | SET_NULL | 색상을 지우면 그 줄은 색상 선택 안 함 (필라멘트 가격으로 계산). 지우기 전에 쓰는 제품을 알려 주고 확인 (PRD FIL-09) |
| `Product.category` → `Category` | PROTECT | 제품이 있으면 카테고리 삭제 불가 |
| `Product.subcategory` → `Subcategory` | PROTECT | 제품이 있으면 세부 분류 삭제 불가 |
| `Subcategory.category` → `Category` | CASCADE | 카테고리 삭제 시 (제품이 없을 때만 가능) 세부 분류도 함께 삭제 |
| `ProductFilament.product` → `Product` | CASCADE | 제품 삭제 시 함께 삭제 |
| `ProductPart.product` → `Product` | CASCADE | 제품 삭제 시 함께 삭제 |
| `Expense.recurring` → `RecurringExpense` | SET_NULL | 반복 지출을 지워도 이미 넣은 지출은 남는다 (연결만 끊김) |
| `SaleItem.sale` → `Sale` | CASCADE | 판매를 지우면 그 제품 줄도 함께 삭제 |
| `SaleItem.product` → `Product` | SET_NULL | 제품을 지워도 판매 줄은 남고, 팔 때 저장한 `product_name` 으로 보인다 |

## 제약 조건 · 인덱스
| 대상 | 종류 | 용도 |
|---|---|---|
| `Brand.name` | UNIQUE | 회사 이름 중복 방지 |
| `Material.name` | UNIQUE | 재질 이름 중복 방지 |
| `Filament (brand, material, series)` | UNIQUE | 같은 필라멘트 중복 방지 |
| `Color (filament, name)` | UNIQUE | 같은 필라멘트 안 색상 이름 중복 방지 |
| `Color.hex` | 형식 검사 | `#` + 16진수 6자리. 입력은 `F5F5F5` / `#f5f5f5` 모두 받아 `#F5F5F5` 로 저장 |
| `Spool.code_no` | UNIQUE | 스풀 번호 (= 스풀 코드) 중복 방지 |
| `Spool.status` | CHOICES | `sealed`(재고) / `open`(사용 중) / `empty`(사용 완료) |
| `Spool (color, status)` | INDEX | 색상별 상태 개수 집계 |
| `Part.name` | UNIQUE | 부자재 품목 이름 중복 방지 |
| `Category.name` | UNIQUE | 카테고리 이름 중복 방지 |
| `Subcategory (category, name)` | UNIQUE | 같은 카테고리 안 세부 분류 이름 중복 방지 |
| `Product.no` | UNIQUE | 제품 No. 중복 방지 |
| `Product.subcategory` | 검사 | 세부 분류는 그 제품의 카테고리에 속해야 함 (`Product.clean`) |
| `ProductFilament.color` | 검사 | 색상은 그 줄의 필라멘트에 속해야 함 (`ProductFilament.clean`) |
| `Expense.category` · `RecurringExpense.category` | CHOICES | 고정 7개 (PRD EXP-03) |
| `Expense (recurring, 연 · 월)` | 검사 | 같은 반복 지출은 한 달에 한 줄만 (`ExpenseSerializer.validate`) |
| `Sale.channel` | CHOICES | `store`(스마트스토어) / `direct`(직접 판매) / `etc`(기타) |
| `Sale.order_no` | UNIQUE (빈 값 제외) | 같은 주문을 두 번 넣지 않게 (스마트스토어 가져오기). 빈 주문번호는 여러 개 가능 |
| `SaleItem.qty` | 검사 | 1 이상 |

## 참고 사항
- 금액·무게·수량은 `DecimalField` (부동소수점 오차 방지). 원 단위 반올림은 화면/CSV 에서 한다.
- 날짜·시각은 `USE_TZ=True` 로 UTC 저장, 화면에는 서울 시간으로 표시.
- 스풀 삭제는 행을 지운다. 변경 이력은 남기지 않는다 (PRD 3.5). 실수로 지웠으면 같은 번호로 다시 등록한다.
- 스풀 코드는 사용자 · 라벨용 식별자라서 DB `id` 와 따로 `code_no`(번호)로 저장한다. id 는 DB 를 옮기거나 다시 만들면
  바뀔 수 있지만, 라벨에 찍힌 코드는 바뀌면 안 되기 때문.
  - 표시: `S` + 번호 최소 5자리 (`12` → `S00012`, `123456` → `S123456`). 코드로 찾을 때는 번호로 바꿔서 찾는다
    (`Spool.code_no_from_code`).
  - 번호: 비우면 자동으로 지금 있는 가장 큰 번호 + 1 (`Spool.next_code_no`), 원하면 직접 지정. 1 이상, 중복 불가.
    스풀을 지우면 그 번호는 비므로 같은 번호로 다시 등록할 수 있다.
  - 글자(`S00012`)가 아니라 숫자로 저장하는 이유: 가장 큰 번호를 구할 때 `S100000` < `S99999` 같은 글자 정렬 문제를 피하려고.
- `Brand.logo` 는 png · jpg · webp, 5MB 까지. 업로드 시 비율을 유지해 256×256px 이내로 축소해 저장 (Pillow, `Brand.save`).
  회사를 삭제하거나 이미지를 바꾸거나 지우면 이전 파일도 지운다 (DB 저장이 확정된 뒤에).
- `Filament.series` 는 빈 문자열 허용 (NULL 대신 `""`) — UNIQUE 조합에서 시리즈 없는 필라멘트도 중복 검사되도록.
- `Product.no`(No.)는 숫자로 저장하고 화면에도 `1, 2, 3 …` 그대로 보여 준다 (글자로 저장하면 자릿수가 다를 때 `10` 이 `2` 보다 앞에 정렬되므로).
  비우면 지금 있는 가장 큰 번호 + 1 (`Product.next_no`), 원하면 직접 지정. 1 이상, 중복 불가.
- `CostSetting` 의 % 값(수수료 · 목표 마진율)은 퍼센트 숫자 그대로 저장한다 (`1.98` = 1.98%). 0 ~ 100.
  `CostSetting.load()` 로 읽고, 행이 없으면 기본값(PRD 3.8)으로 만든다.
