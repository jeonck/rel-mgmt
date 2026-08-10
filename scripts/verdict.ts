import type { Reason, Verdict } from '../src/lib/types.js';

/**
 * 규칙 기반 Go/NoGo 판정 엔진.
 *
 * 설계 원칙
 *  1. 점수는 100점에서 시작해 리스크만큼 깎는다. 근거(reasons)는 전부 남긴다.
 *  2. "즉시 탈락" 조건(프리릴리즈 / EOL 경과)은 점수와 무관하게 NO-GO다.
 *  3. 임계값은 제품별 policy로 덮어쓸 수 있다 — DB와 CLI 도구의 리스크는 같지 않다.
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
  /** 알려진 정보가 사실상 없을 때 UNKNOWN 처리 */
  hasData: boolean;
}

export interface VerdictResult {
  verdict: Verdict;
  score: number;
  reasons: Reason[];
}

export function evaluate(input: VerdictInput, policy: Policy = DEFAULT_POLICY): VerdictResult {
  const reasons: Reason[] = [];
  const add = (code: string, label: string, delta: number, tone: Reason['tone']) =>
    reasons.push({ code, label, delta, tone });

  if (!input.hasData) {
    add('no-data', '수집된 버전 정보가 없어 판정할 수 없습니다', 0, 'info');
    return { verdict: 'UNKNOWN', score: 0, reasons };
  }

  // ── 즉시 탈락 조건
  if (input.prerelease) {
    add('prerelease', '프리릴리즈(RC/beta/alpha) — 운영 도입 대상 아님', -100, 'bad');
    return { verdict: 'NO-GO', score: 0, reasons };
  }
  if (input.isEol) {
    add('eol-passed', '보안 지원 종료(EOL) — 신규 도입 금지, 기존 사용 시 업그레이드 필요', -100, 'bad');
    return { verdict: 'NO-GO', score: 0, reasons };
  }

  let score = 100;
  const cut = (code: string, label: string, delta: number, tone: Reason['tone']) => {
    score += delta;
    add(code, label, delta, tone);
  };

  // ── 1. 숙성 기간 (soak time)
  //
  // 새 마이너 트레인(.0)과 기존 트레인의 패치 릴리즈는 리스크 성격이 다르다.
  // 전자는 기능 변경이 들어와 초기 결함이 몰리고, 후자는 대개 버그·보안 수정이라
  // 오래 미루는 것 자체가 리스크다. 그래서 기준일을 나눠 적용한다.
  const isNewTrain = input.patch === null || input.patch === 0;

  if (input.ageDays === null) {
    cut('age-unknown', '릴리즈 일자 미상 — 숙성 기간 확인 불가', -10, 'warn');
  } else if (isNewTrain) {
    if (input.ageDays < 7) {
      cut('age-fresh', `새 트레인 출시 ${input.ageDays}일차 — 초기 결함 리스크가 가장 높은 구간`, -45, 'bad');
    } else if (input.ageDays < policy.minSoakDays) {
      cut(
        'age-short',
        `새 트레인 숙성 기간 부족 (${input.ageDays}일 / 기준 ${policy.minSoakDays}일)`,
        -25,
        'warn',
      );
    } else {
      add('age-ok', `출시 ${input.ageDays}일 경과 — 숙성 기준 충족`, 0, 'good');
    }
  } else if (input.ageDays < 3) {
    cut('patch-fresh', `패치 릴리즈 ${input.ageDays}일차 — 회귀 여부가 아직 드러나지 않음`, -25, 'warn');
  } else if (input.ageDays < 10) {
    cut('patch-recent', `패치 릴리즈 ${input.ageDays}일차 — 짧은 검증 기간`, -12, 'warn');
  } else {
    add('age-ok', `패치 릴리즈 후 ${input.ageDays}일 경과 — 검증 기간 충족`, 0, 'good');
  }

  // ── 2. 패치 성숙도
  if (input.patch === null) {
    add('patch-unknown', '패치 번호를 해석할 수 없는 버전 체계', 0, 'info');
  } else if (input.patch === 0) {
    cut('patch-zero', '.0 릴리즈 — 첫 패치 전까지 알려지지 않은 결함이 남아 있을 수 있음', -20, 'warn');
  } else if (input.patch < policy.minPatch) {
    cut('patch-low', `패치 ${input.patch} — 기준(${policy.minPatch}) 미만`, -10, 'warn');
  } else {
    add('patch-ok', `패치 ${input.patch} 누적 — 초기 결함이 정리된 수준`, 0, 'good');
  }

  // ── 3. 잔여 지원 기간 (EOL runway)
  if (input.eolInDays === null) {
    add('eol-unknown', 'EOL 일정 미공개', 0, 'info');
  } else if (input.eolInDays < 30) {
    cut('eol-30', `EOL까지 ${input.eolInDays}일 — 사실상 도입 불가`, -55, 'bad');
  } else if (input.eolInDays < 90) {
    cut('eol-90', `EOL까지 ${input.eolInDays}일 — 도입 즉시 재업그레이드 필요`, -30, 'bad');
  } else if (input.eolInDays < policy.eolWarnDays) {
    cut('eol-warn', `EOL까지 ${input.eolInDays}일 — 운영 기간이 짧음`, -15, 'warn');
  } else if (input.eolInDays >= 365) {
    score += 5;
    add('eol-long', `EOL까지 ${input.eolInDays}일 — 충분한 운영 기간 확보`, 5, 'good');
  } else {
    add('eol-ok', `EOL까지 ${input.eolInDays}일`, 0, 'info');
  }

  // ── 4. 일반 지원 상태
  if (input.isSupportEnded) {
    cut('support-ended', '일반 지원 종료 — 보안 패치만 제공되는 라인', -20, 'warn');
  }
  if (!input.isMaintained) {
    cut('unmaintained', '유지보수 중단된 릴리즈 트레인', -25, 'bad');
  }

  // ── 5. LTS 가산
  if (input.isLts) {
    score += 8;
    add('lts', 'LTS 라인 — 장기 지원 대상', 8, 'good');
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
