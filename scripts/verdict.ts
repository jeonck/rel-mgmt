import type { Reason, SecurityReport, Verdict } from '../src/lib/types.js';

/**
 * 규칙 기반 Go/NoGo 판정 엔진.
 *
 * 설계 원칙
 *  1. 점수는 100점에서 시작해 리스크만큼 깎는다. 근거(reasons)는 전부 남긴다.
 *  2. "즉시 탈락" 조건(프리릴리즈 / EOL 경과 / CRITICAL CVE)은 점수와 무관하게 NO-GO다.
 *  3. 임계값은 제품별 policy로 덮어쓸 수 있다 — DB와 CLI 도구의 리스크는 같지 않다.
 *  4. 근거 문구는 사이트 표기 언어(영문)로 생성해 그대로 화면에 나간다.
 */

export interface Policy {
  /** 새 버전을 신뢰하기까지 필요한 최소 경과일 */
  minSoakDays: number;
  /** 안정으로 볼 최소 패치 번호 (x.y.Z) */
  minPatch: number;
  /** EOL 잔여일이 이보다 짧으면 신규 도입 부적합 */
  eolWarnDays: number;
}

export const DEFAULT_POLICY: Policy = {
  minSoakDays: 30,
  minPatch: 1,
  eolWarnDays: 180,
};

/**
 * 임계값은 "단일 리스크로도 GO를 뺏을 수 있는가"를 기준으로 잡았다.
 *  - 숙성 부족(-25) 하나만으로 75점 → HOLD로 떨어져야 한다
 *  - .0 릴리즈(-20)뿐이고 충분히 숙성됐다면 80점 → GO로 남는다
 */
export const THRESHOLD = { go: 80, hold: 50 } as const;

export interface VerdictInput {
  patch: number | null;
  ageDays: number | null;
  prerelease: boolean;
  isLts: boolean;
  isEol: boolean;
  isSupportEnded: boolean;
  isMaintained: boolean;
  eolInDays: number | null;
  security: SecurityReport;
  /** 'advisory'면 CVE를 표시만 하고 점수에는 반영하지 않는다 */
  cveScoring: 'score' | 'advisory';
  /** 알려진 정보가 사실상 없을 때 UNKNOWN 처리 */
  hasData: boolean;
}

export interface VerdictResult {
  verdict: Verdict;
  score: number;
  reasons: Reason[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const verb = (n: number, singular: string, pluralForm: string) => (n === 1 ? singular : pluralForm);

export function evaluate(input: VerdictInput, policy: Policy = DEFAULT_POLICY): VerdictResult {
  const reasons: Reason[] = [];
  const add = (code: string, label: string, delta: number, tone: Reason['tone']) =>
    reasons.push({ code, label, delta, tone });

  if (!input.hasData) {
    add('no-data', 'No release data collected — cannot evaluate', 0, 'info');
    return { verdict: 'UNKNOWN', score: 0, reasons };
  }

  // ── 즉시 탈락 조건
  if (input.prerelease) {
    add('prerelease', 'Pre-release (RC / beta / alpha) — not a production candidate', -100, 'bad');
    return { verdict: 'NO-GO', score: 0, reasons };
  }
  if (input.isEol) {
    add(
      'eol-passed',
      'Past end-of-life — no security patches; upgrade required, do not adopt',
      -100,
      'bad',
    );
    return { verdict: 'NO-GO', score: 0, reasons };
  }

  const sec = input.security;
  const cveUsable = sec.status === 'ok';
  const cveScored = cveUsable && input.cveScoring === 'score';

  if (cveScored && sec.counts.CRITICAL > 0) {
    const worst = sec.top.find((c) => c.severity === 'CRITICAL');
    add(
      'cve-critical',
      `${plural(sec.counts.CRITICAL, 'critical CVE')} ${verb(sec.counts.CRITICAL, 'affects', 'affect')} this version${worst ? ` (${worst.id}, CVSS ${worst.score})` : ''}`,
      -100,
      'bad',
    );
    return { verdict: 'NO-GO', score: 0, reasons };
  }

  let score = 100;
  const cut = (code: string, label: string, delta: number, tone: Reason['tone']) => {
    score += delta;
    add(code, label, delta, tone);
  };

  // ── 1. 알려진 취약점
  //
  // NVD의 CPE 데이터는 신규 릴리즈에 대해 수 주 늦는다. 그래서 "0건"을 안전의 근거로
  // 쓰지 않고, 조회했다는 사실만 정보성으로 남긴다. 조회 실패 시에는 감점하지 않는다
  // (일시 장애로 멀쩡한 버전을 NO-GO로 떨어뜨리면 보드를 신뢰할 수 없게 된다).
  if (cveUsable && input.cveScoring === 'advisory') {
    // 패키지 업데이트로 해소되는 취약점이라 버전 판정과 분리한다
    add(
      'cve-advisory',
      sec.counts.total > 0
        ? `${plural(sec.counts.total, 'CVE')} recorded against this release — fixed by package updates, not by changing version, so not scored`
        : 'No CVEs recorded in NVD against this release',
      0,
      sec.counts.total > 0 ? 'info' : 'good',
    );
  } else if (!cveUsable) {
    if (sec.status === 'unmapped') {
      add('cve-unmapped', 'No CPE mapping — CVE tracking unavailable for this product', 0, 'info');
    } else if (sec.status === 'error') {
      add('cve-error', 'NVD lookup failed — vulnerability data unavailable this run', 0, 'warn');
    }
  } else if (sec.counts.HIGH > 0) {
    const worst = sec.top.find((c) => c.severity === 'HIGH');
    cut(
      'cve-high',
      `${plural(sec.counts.HIGH, 'high-severity CVE')} ${verb(sec.counts.HIGH, 'affects', 'affect')} this version${worst ? ` (${worst.id}, CVSS ${worst.score})` : ''}`,
      -40,
      'bad',
    );
  } else if (sec.counts.MEDIUM > 0) {
    cut(
      'cve-medium',
      `${plural(sec.counts.MEDIUM, 'medium-severity CVE')} ${verb(sec.counts.MEDIUM, 'affects', 'affect')} this version`,
      -15,
      'warn',
    );
  } else if (sec.counts.LOW + sec.counts.UNSCORED > 0) {
    cut(
      'cve-low',
      `${plural(sec.counts.LOW + sec.counts.UNSCORED, 'low or unscored CVE')} ${verb(sec.counts.LOW + sec.counts.UNSCORED, 'affects', 'affect')} this version`,
      -5,
      'warn',
    );
  } else {
    add('cve-none', 'No CVEs recorded in NVD against this version', 0, 'good');
  }

  // ── 2. 숙성 기간 (soak time)
  //
  // 새 마이너 트레인(.0)과 기존 트레인의 패치 릴리즈는 리스크 성격이 다르다.
  // 전자는 기능 변경이 들어와 초기 결함이 몰리고, 후자는 대개 버그·보안 수정이라
  // 오래 미루는 것 자체가 리스크다. 그래서 기준일을 나눠 적용한다.
  const isNewTrain = input.patch === null || input.patch === 0;

  if (input.ageDays === null) {
    cut('age-unknown', 'Release date unknown — soak time cannot be verified', -10, 'warn');
  } else if (isNewTrain) {
    if (input.ageDays < 7) {
      cut(
        'age-fresh',
        `New train, ${plural(input.ageDays, 'day')} old — highest window for early defects`,
        -45,
        'bad',
      );
    } else if (input.ageDays < policy.minSoakDays) {
      cut(
        'age-short',
        `New train under-soaked (${input.ageDays} of ${policy.minSoakDays} days)`,
        -25,
        'warn',
      );
    } else {
      add('age-ok', `${plural(input.ageDays, 'day')} since release — soak target met`, 0, 'good');
    }
  } else if (input.ageDays < 3) {
    cut(
      'patch-fresh',
      `Patch released ${plural(input.ageDays, 'day')} ago — regressions not yet surfaced`,
      -25,
      'warn',
    );
  } else if (input.ageDays < 10) {
    cut('patch-recent', `Patch released ${plural(input.ageDays, 'day')} ago — short bake time`, -12, 'warn');
  } else {
    add('age-ok', `${plural(input.ageDays, 'day')} since patch — bake time met`, 0, 'good');
  }

  // ── 3. 패치 성숙도
  if (input.patch === null) {
    add('patch-unknown', 'Versioning scheme has no parseable patch number', 0, 'info');
  } else if (input.patch === 0) {
    cut('patch-zero', '.0 release — unknown defects remain until the first patch', -20, 'warn');
  } else if (input.patch < policy.minPatch) {
    cut('patch-low', `Patch ${input.patch} — below the ${policy.minPatch}-patch target`, -10, 'warn');
  } else {
    add('patch-ok', `${plural(input.patch, 'patch')} shipped — early defects settled`, 0, 'good');
  }

  // ── 4. 잔여 지원 기간 (EOL runway)
  if (input.eolInDays === null) {
    add('eol-unknown', 'No published end-of-life date', 0, 'info');
  } else if (input.eolInDays < 30) {
    cut('eol-30', `${plural(input.eolInDays, 'day')} of support left — not adoptable`, -55, 'bad');
  } else if (input.eolInDays < 90) {
    cut(
      'eol-90',
      `${plural(input.eolInDays, 'day')} of support left — you would re-upgrade immediately`,
      -30,
      'bad',
    );
  } else if (input.eolInDays < policy.eolWarnDays) {
    cut('eol-warn', `${plural(input.eolInDays, 'day')} of support left — short runway`, -15, 'warn');
  } else if (input.eolInDays >= 365) {
    score += 5;
    add('eol-long', `${plural(input.eolInDays, 'day')} of support left — comfortable runway`, 5, 'good');
  } else {
    add('eol-ok', `${plural(input.eolInDays, 'day')} of support left`, 0, 'info');
  }

  // ── 5. 지원 상태
  if (input.isSupportEnded) {
    cut('support-ended', 'Active support ended — security fixes only', -20, 'warn');
  }
  if (!input.isMaintained) {
    cut('unmaintained', 'Release train is no longer maintained', -25, 'bad');
  }

  // ── 6. LTS 가산
  if (input.isLts) {
    score += 8;
    add('lts', 'Long-term support train', 8, 'good');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const verdict: Verdict = score >= THRESHOLD.go ? 'GO' : score >= THRESHOLD.hold ? 'HOLD' : 'NO-GO';

  // 근거는 영향이 큰 순으로 정렬해 UI 상단에 리스크가 먼저 오게 한다
  reasons.sort((a, b) => a.delta - b.delta);

  return { verdict, score, reasons };
}

export function resolvePolicy(override?: Partial<Policy>): Policy {
  return { ...DEFAULT_POLICY, ...override };
}
