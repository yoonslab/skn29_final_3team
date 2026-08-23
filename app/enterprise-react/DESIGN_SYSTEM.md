# ANSWERVICE 디자인 시스템 스펙 (v1)

> 근거: B2B SaaS 타이포그래피 가이드(Minor Third 스케일·라벨/값 분리), Sigma 그리드 원칙(좌측 정렬·일관 행 높이), ThoughtSpot 대시보드 베스트프랙티스(KPI 5~7개·위계), WCAG 2.1 AA.
> 적용 방식: 기존 styles.css의 `:root` 토큰을 이 스케일로 정규화하고, 모든 페이지 CSS가 토큰만 참조하도록 통일.

## 1. 타이포그래피

- 폰트 스택(UI): `Inter, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
- 폰트 스택(데이터/코드): `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`
- 스케일(Minor Third 1.2, base 14):

| 토큰 | 크기/굵기 | 용도 |
|---|---|---|
| `--fs-caption` | 12px / 400 | 메타·캡션(muted 색) |
| `--fs-secondary` | 13px / 400 | 보조 설명 |
| `--fs-body` | 14px / 400 | 본문·테이블 셀 |
| `--fs-emphasis` | 16px / 500 | 강조 본문 |
| `--fs-h3` | 18px / 600 | 카드·위젯 제목 |
| `--fs-h2` | 22px / 600 | 섹션 제목 |
| `--fs-h1` | 28px / 600 | 페이지 제목 |
| 데이터 값 | 라벨보다 크게 / 600 / mono | KPI 숫자·지표 값 |

규칙: 라벨(caption/muted)과 값(large/bold/mono)은 반드시 시각적으로 구분. 줄간격 본문 1.5, 테이블 1.4, 축 라벨 1.2. 길면 말줄임(text-overflow 규칙 일관).

## 2. 공간·형태

- 간격 4px 그리드: 4 · 8 · 12 · 16 · 24 · 32 · 48 (`--sp-*`)
- radius: 카드 8px, 입력 6px, pill/full
- 그림자 2단계: `--shadow-sm`(hover 카드), `--shadow-md`(드로어·모달)
- 컨테이너 최대폭 ~1400px 중앙, 페이지 배경은 뉴트럴(`--bg-page`)·표면은 화이트(`--bg-surface`)
- 제목·KPI는 좌측 정렬(중앙 정렬 금지), 같은 행 요소 높이 일치

## 3. 색상·상태

- 텍스트: primary `--text-primary`, secondary `--text-secondary`, muted `--text-muted`
- 선: `--line` 1px
- 액센트 1개(브랜드 계열 유지) + 상태 톤: success(녹)/warning(호박)/danger(적)/info(청) — 배경은 소프트 톤 10~12% + 도트·아이콘 병행(색 단독 의미 전달 금지)
- 대비: 본문 ≥ 4.5:1, 대형 텍스트 ≥ 3:1

## 4. 컴포넌트 규격

- 버튼: primary(액센트 배경), secondary(외곽선), ghost — 높이 36px, radius 6px, focus-visible 링 2px 오프셋
- 입력: 높이 36px, focus ring 액센트
- 테이블: 행 높이 40px, 셀 패딩 10×12, 헤더 caption uppercase letter-spacing 0.02em
- 배지/필: 도트+라벨, 상태 톤 소프트 배경
- 모션: 150ms ease-out, 스켈레톤 shimmer, pulse는 RUNNING 계열만

## 5. 페이지별 체크리스트

- [ ] 제목 좌측 정렬 + h1/h2 스케일 적용
- [ ] KPI 값 = mono 600 라벨 분리
- [ ] 모든 인터랙티브 focus-visible
- [ ] 빈/로딩/오류 상태 문구 존재
- [ ] 하드코딩 hex 제거(토큰만)
