/**
 * 수집기(scripts/)와 웹 UI(src/)가 함께 쓰는 데이터 계약.
 * 이 파일이 바뀌면 public/data/releases.json 스키마도 같이 바뀐다.
 */

export const SCHEMA_VERSION = 1;

export type Verdict = 'GO' | 'HOLD' | 'NO-GO' | 'UNKNOWN';

export type CategoryId = 'container' | 'iac-cicd' | 'observability' | 'runtime';

export interface Category {
  id: CategoryId;
  label: string;
  short: string;
}

export const CATEGORIES: Category[] = [
  { id: 'container', label: 'Containers & Orchestration', short: 'Containers' },
  { id: 'iac-cicd', label: 'IaC & CI/CD', short: 'IaC · CI/CD' },
  { id: 'observability', label: 'Observability', short: 'Observability' },
  { id: 'runtime', label: 'Runtimes, Middleware & Databases', short: 'Runtime · DB' },
];

/** 판정 근거 한 줄. UI에서 그대로 나열한다. */
export interface Reason {
  /** 규칙 식별자 (테스트/디버깅용) */
  code: string;
  /** 사용자에게 보여줄 설명 (영문 — 사이트 표기 언어) */
  label: string;
  /** 점수 가감 (0이면 정보성) */
  delta: number;
  tone: 'good' | 'warn' | 'bad' | 'info';
}

export type CveSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSCORED';

export const CVE_SEVERITIES: CveSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSCORED'];

export interface CveRef {
  /** CVE-2026-12345 */
  id: string;
  /** CVSS base score. NVD 분석 전이면 null */
  score: number | null;
  severity: CveSeverity;
  published: string | null;
  summary: string;
  url: string;
}

export type SecurityStatus =
  /** NVD 조회 성공 */
  | 'ok'
  /** 이 제품에 매핑된 CPE가 없어 조회 자체가 불가 */
  | 'unmapped'
  /** 조회 실패 (일시 장애 등) — 판정에 반영하지 않는다 */
  | 'error'
  /** 이 버전은 조회 대상이 아니었다 (상위 후보만 조회한다) */
  | 'skipped';

export interface SecurityReport {
  status: SecurityStatus;
  /** 이 버전에 영향을 주는 것으로 NVD에 등록된 CVE 수 */
  counts: Record<CveSeverity, number> & { total: number };
  /** 심각도 높은 순 상위 항목 */
  top: CveRef[];
  cpe: string | null;
  checkedAt: string | null;
  /** 조회 실패 사유나 절삭 안내 */
  note?: string;
}

/** 하나의 버전에 대한 평가 결과 */
export interface ReleaseCandidate {
  /** 정규화된 버전 문자열 (v 접두어 제거) */
  version: string;
  /** 릴리즈 트레인 (major.minor). 예: "1.36" */
  train: string | null;
  /** 패치 번호. 1.36.3 -> 3 */
  patch: number | null;
  channel: 'stable' | 'prerelease';
  releaseDate: string | null;
  /** 릴리즈 후 경과일 (soak time) */
  ageDays: number | null;
  isLts: boolean;
  /** 보안 패치까지 끝나는 날 (EOL) */
  eolDate: string | null;
  eolInDays: number | null;
  isEol: boolean;
  /** 일반 지원 종료일 (endoflife.date의 eoas) */
  supportEndDate: string | null;
  isSupportEnded: boolean;
  notesUrl: string | null;
  /** NVD 조회 결과. 상위 후보 몇 개만 실제로 조회한다. */
  security: SecurityReport;
  verdict: Verdict;
  /** 0~100 */
  score: number;
  reasons: Reason[];
}

/** EOL 타임라인 표시에 쓰는 릴리즈 트레인 요약 */
export interface TrainInfo {
  train: string;
  latest: string | null;
  releaseDate: string | null;
  eolDate: string | null;
  eolInDays: number | null;
  isEol: boolean;
  isLts: boolean;
  isMaintained: boolean;
}

export interface Product {
  id: string;
  name: string;
  category: CategoryId;
  vendor: string;
  /** 한 줄 설명 — 카드/행 보조 텍스트 */
  blurb: string;
  homepage: string;
  /** public/icons/<iconId>.svg 로 저장된 단색 아이콘. 없으면 이니셜 폴백. */
  iconId: string | null;
  /** 상위 결론 — recommended 기준 */
  verdict: Verdict;
  /** 최신 안정 버전 */
  latest: ReleaseCandidate | null;
  /** 지금 도입해도 되는 가장 최신 버전 (GO 판정 중 최신) */
  recommended: ReleaseCandidate | null;
  trains: TrainInfo[];
  sources: {
    github?: string;
    endoflife?: string;
    releasePolicy?: string;
  };
  /** 수집 실패 메시지 (있으면 UI에 stale 표시) */
  errors: string[];
  collectedAt: string;
}

export type ChangeKind =
  | 'new-version'
  | 'verdict-up'
  | 'verdict-down'
  | 'eol-soon'
  | 'new-cve'
  | 'new-product';

export interface ChangeEvent {
  at: string;
  productId: string;
  productName: string;
  category: CategoryId;
  kind: ChangeKind;
  /** 사람이 읽는 한 줄 요약 */
  message: string;
  from?: string;
  to?: string;
}

export interface Snapshot {
  schemaVersion: number;
  generatedAt: string;
  /** 수집 기준 시간대 */
  timezone: string;
  counts: {
    total: number;
    go: number;
    hold: number;
    nogo: number;
    unknown: number;
    eolSoon: number;
    errored: number;
    /** 최신 버전이 CVE 영향을 받는 제품 수 */
    cveAffected: number;
    /** 그중 CRITICAL/HIGH를 포함하는 제품 수 */
    cveSevere: number;
  };
  /** 이번 수집에서 감지된 변경 */
  changes: ChangeEvent[];
  products: Product[];
}

/** public/data/events.json — 최근 변경 누적 로그 */
export interface EventLog {
  updatedAt: string;
  events: ChangeEvent[];
}
