# Answervice 아키텍처

| 항목 | 내용 |
|---|---|
| 문서 설명 | Answervice의 시스템 구성, 분석 파이프라인, 데이터 계층, 코드 구조를 정의한 아키텍처 문서 |
| 문서 분류 | 일반 문서 |
| 버전 | v1.1 |
| 문서 기준일 | 2026-08-24 00:30 |
| 작성·수정 | AI 에이전트(Sisyphus) · 업계 표준 용어로 전면 정비(v1.1) |

> 용어 기준: 초기 암호(G1·G2·G3, Node N)를 업계 표준 명칭으로 교체했다. 과거 기록의 구칭은 §0 대응표를 따른다.

## 0. 용어 정리 (구칭 → 표준칭)

| 구칭 (초기 암호) | 표준 명칭 |
|---|---|
| G1 · Context Gate | **컨텍스트 검증** (Context Validation) |
| G2 · SQL Policy Gate | **SQL 안전성 검증** (SQL Safety Validation) |
| G3 · Result Gate | **결과 검증** (Result Verification) |
| Node 1 / 2 / 2′ / 3 | 질문 이해 / SQL 생성 / SQL 수정(1회) / 설명 생성 |

## 1. 전체 구성

```
[사용자]
   │ HTTPS
┌──▼──────────────────────────────┐
│ Frontend (app/enterprise-react) │  React SPA — 결과 표시 전담, 수치·권한 재계산 없음
└──┬──────────────────────────────┘
   │ OpenAPI 계약 (openapi.v0.1.json)
┌──▼───────────────────────────────────────────┐
│ FastAPI Control Plane (app/backend)          │
│  인증·역할 Context → 고정 상태 머신 Controller │
│  검증 파이프라인 → Cache·Artifact·Audit       │
└──┬──────────────┬───────────────┬────────────┘
   │              │               │
┌──▼───────────┐ ┌▼─────────┐ ┌───▼──────────┐
│ 분석 에이전트 │ │  Trino   │ │    DataHub   │
│ (src/ai)     │ │ 읽기전용  │ │ 메타데이터 기준│
│ 질문이해·SQL  │ │ 연합조회  │ │ URN·owner·tag│
│ 생성·설명     │ └────┬─────┘ │ lineage      │
└──────────────┘      │       └──────────────┘
                  ▼
   [5 sources / 4 engines — 읽기 전용 계정]
```

설계 원칙:

- **DataHub = 메타데이터 기준 시스템**, **Trino = 읽기 전용 연합 조회 엔진**, **FastAPI Controller = 고정 상태 전이와 검증 단계를 통제하는 Control Plane**.
- AI(에이전트)는 권한 판정·SQL 실행 허용·검증 통과·결과 정답을 스스로 판정하지 않는다. 판정은 Control Plane의 검증 단계가 한다.
- 원본 데이터 이동 없이 연합 조회가 기본이며, 실측된 병목 구간만 최소 파생 데이터셋 배치 적재 후보가 된다.

## 2. 분석 파이프라인 (질문 → 결과)

```
① 질문 이해            intent·time 후보·승인 metric 정확히 1개 선택
                       (0개 또는 2개 이상이면 재질문으로 되돌림)
② Context Builder     권한 있는 자산·metric·JOIN 관계를 묶어
                       versioned Context Package 생성
③ 컨텍스트 검증         데이터 근거 충분한지 검사 → 실패 시 BLOCKED
④ SQL 생성             Context 제한 Trino SQL + 참조 목록 산출
⑤ SQL 안전성 검증       AST 파싱(SQLGlot)·정책 검사 → 위험 조회 차단
   └ SQL 수정(1회)     오류는 1회만 repair, 초과 시 중단
⑥ 조회 실행            read-only 계정·timeout·행 수 제한·cancel
⑦ 결과 검증            결과 정확성·완결성 검증 → 통과분만 다음 단계로
⑧ 설명 생성            결과 검증 통과분 전용 — 근거·조건·주의 설명,
                       수치 재계산 없음
⑨ Artifact 보존        승인 후 수정 불가 결과물 + 출처
⑩ Report 반영         definition 블록으로 전달 → 승인 → 실행 이력
```

각 단계는 request trace로 기록되며, 문제 발생 시 실행 전에 중단한다. SQL Plan·결과는 versioned cache key(정규화된 질문·template·package hash 기준)로 캐싱한다.

프론트엔드는 `POST /api/v1/agent/analyze/stream`(SSE)으로 ①~⑦ 진행을 실시간 trace 이벤트로 받아 표시한다.

## 3. 검증 단계 3종 (Validation Pipeline)

모든 생성 조회는 실행 전 3개 검증 단계를 통과해야 한다. 업계 표준 Text-to-SQL guardrails 패턴(스키마 연결 → 사전 검증 → 읽기 전용 실행 → 결과 확인)을 따른다.

| 검증 단계 | 검사 내용 | 실패 시 |
|---|---|---|
| **컨텍스트 검증** | 필요한 데이터·지표 근거가 있는지, 권한이 있는지 | `BLOCKED` + 재질문 안내 |
| **SQL 안전성 검증** | AST 파싱 성공·단일 SELECT·읽기 전용·쓰기/우회/비승인 JOIN 차단 | 실행 차단 + 안전한 사유 |
| **결과 검증** | 조회 결과가 정확하고 완결적인지 | 결과 폐기, 성공 위장 금지 |

fail-closed 원칙: 이해할 수 없는 입력(파싱 실패·미등록 테이블·권한 미확인)은 허용하지 않고 거부한다.

## 4. 데이터 계층 — 5 source · 4 engine

| Source | 담당 업무 | 엔진 | 격리 방식 |
|---|---|---|---|
| PMS | 예약·객실·투숙·요금 | PostgreSQL | 전용 인스턴스·DB·읽기 계정·ingestion recipe |
| F&B POS | 주문·매장·상품·결제 | MySQL | POS 전용 인스턴스·recipe |
| 멤버십 CRM | 고객·등급·포인트 | MS SQL Server | CRM 전용 (`member_no` 기준) |
| 시설 운영 | 시설 이용·점검·장애 | ClickHouse | 이벤트 전용 인스턴스 |
| 연회·매출 | 연회 예약·상품·매출 | PostgreSQL | PMS와 분리된 DB·catalog |

- 4개 엔진 런타임 / 5개 논리 DB / 5개 자격증명 / 5개 ingestion recipe / 5개 Trino catalog로 격리.
- 원천 계정은 모두 **읽기 전용**, Trino도 `read-only` system access control 적용. procedure·passthrough query·`system` catalog는 일반 경로에서 차단.
- 교차 소스 조회는 승인된 JOIN Registry 규칙만 허용하며, 업무 시나리오는 실제 연관 1~3개 source만 사용.
- 합성 데이터만 사용: deterministic seed·schema version·scenario version 기록, 재적재로 동일 결과 재현.

## 5. Report 도메인

- **definition / run 분리**: 보고서 정의(블록 구성)와 실행 결과(이력)를 별개 객체로 관리.
- 12-column 블록 그리드(table·chart·text), 블록은 분석 Artifact ID와 출처를 유지한 채 삽입.
- 상태 머신: `DRAFT → APPROVED → RUNNING → SUCCESS / PARTIAL_SUCCESS / FAILED`. 승인본은 변경 불가, 편집은 새 definition version 생성.
- 실행 시 한 블록 실패가 전체를 중단시키지 않으며, 블록별 snapshot·checksum·출처가 run 상세에 기록.
- 수동 실행 + daily/weekly/monthly 스케줄 실행 지원, 같은 요청의 중복 처리 방지.

## 6. 코드 구조

```
app/
├─ backend/                 FastAPI Control Plane (R4)
│  ├─ app/api/              router (analysis, agent SSE stream, datahub catalog, report …)
│  ├─ app/controllers/      고정 상태 전이
│  ├─ app/services/         context_builder·pipeline·validation·cache
│  ├─ app/adapters|ports/   DataHub·Trino·Model adapter 경계
│  ├─ app/report_contracts  Report 요청 계약 (Pydantic, extra=forbid)
│  ├─ contracts/            openapi.v0.1.json 공개 계약
│  └─ migrations/           Alembic chain
├─ enterprise-react/src/    활성 frontend (pages·components·api·contracts)
└─ fastapi/                 실행 entrypoint
src/
├─ ai/                      Node·prompt registry·평가 runner·학습(training)
│  └─ contracts/            metric glossary 등 versioned 계약
├─ data/                    source·adapter·seed
├─ analysis/                분석 도메인 로직
├─ report/                  Report 도메인 로직
└─ modelops/                model serving·운영
```

## 7. 보안·추적·모델 운영

- **권한**: role·as_of 기반 request context, 권한 밖 자산은 Context에 진입 불가, 화면은 API 결과를 그대로 표시.
- **감사**: 요청 단위 linked trace(질문→Context→SQL→실행→결과→Report), 민감정보 mask·redaction, retention·backup hook.
- **모델**: Base model 기준선 우선, 조건부 LoRA 비교는 time-boxed 1회·제품 채택은 별도 승인. prompt·model·adapter는 version·hash로 고정(release manifest). retry·fallback·circuit 계약을 가진 production client 사용.

## 변경 내역

| 버전 | 일시 | 요약 |
|---|---|---|
| v1.1 | 2026-08-24 00:30 | 초기 암호(G1·G2·G3·Node N)를 업계 표준 용어로 전면 교체, 용어 정리표·SSE 인터페이스·fail-closed 원칙 추가 |
| v1.0 | 2026-08-23 22:15 | 기획서·WBS·실제 코드 구조 기준으로 아키텍처 지식 통합 재정의 |
