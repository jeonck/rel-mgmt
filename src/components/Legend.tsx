import type { Snapshot } from '../lib/types';
import { formatDateTime, formatInCentral } from '../lib/format';
import { VERDICT_DESCRIPTION, VerdictBadge } from './VerdictBadge';

const RULES: { label: string; detail: string }[] = [
  { label: '프리릴리즈', detail: 'RC/beta/alpha 태그는 무조건 NO-GO — 운영 도입 대상에서 제외' },
  { label: 'EOL 경과', detail: '보안 지원이 끝난 버전은 무조건 NO-GO' },
  { label: '새 트레인 숙성', detail: '.0 출시 7일 미만 −45점, 기준일(기본 30일) 미만 −25점' },
  { label: '패치 숙성', detail: '기존 트레인 패치는 기준이 짧다 — 3일 미만 −25점, 10일 미만 −12점' },
  { label: '패치 성숙도', detail: '.0 릴리즈 −20점, 기준 패치 번호 미만 −10점' },
  { label: '잔여 지원', detail: 'EOL 30일 미만 −55 / 90일 미만 −30 / 180일 미만 −15, 365일 이상 +5' },
  { label: '지원 상태', detail: '일반 지원 종료 −20점, 유지보수 중단 트레인 −25점' },
  { label: 'LTS', detail: '장기 지원 라인 +8점' },
];

export function Legend({ snapshot }: { snapshot: Snapshot }) {
  return (
    <footer className="flex flex-col gap-6 pt-4 pb-16 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
      <div
        className="grid gap-6 rounded-xl p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
      >
        <section>
          <h2 className="mb-3 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
            판정 기준
          </h2>
          <ul className="flex flex-col gap-2">
            {(['GO', 'HOLD', 'NO-GO'] as const).map((v) => (
              <li key={v} className="flex items-center gap-2.5">
                <VerdictBadge verdict={v} size="sm" />
                <span>{VERDICT_DESCRIPTION[v]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            100점에서 리스크만큼 감점하고, <strong style={{ color: 'var(--go)' }}>80점 이상 GO</strong> ·{' '}
            <strong style={{ color: 'var(--hold)' }}>50점 이상 HOLD</strong> ·{' '}
            <strong style={{ color: 'var(--nogo)' }}>미만 NO-GO</strong>로 나눕니다. 헤드라인 판정은 “최신 버전을 지금
            올려도 되는가”에 답하고, 그렇지 않을 때 대안이 <em>도입 권장</em> 버전입니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
            감점 규칙
          </h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {RULES.map((r) => (
              <div key={r.label}>
                <dt className="font-semibold" style={{ color: 'var(--text)' }}>
                  {r.label}
                </dt>
                <dd className="text-[11.5px] leading-snug" style={{ color: 'var(--text-faint)' }}>
                  {r.detail}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            임계값은 제품별로 다릅니다 — DB·K8s처럼 되돌리기 어려운 시스템은 숙성 기준을 60~90일로 올려 잡았습니다.
            <code className="mono ml-1 rounded px-1" style={{ background: 'var(--surface)' }}>
              scripts/catalog.ts
            </code>
            의 <code className="mono">policy</code>에서 조정합니다.
          </p>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        <p>
          데이터 출처{' '}
          <a href="https://endoflife.date" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            endoflife.date
          </a>{' '}
          ·{' '}
          <a href="https://docs.github.com/rest/releases" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            GitHub Releases API
          </a>{' '}
          · 매일 CDT 02:00 (UTC 07:00) GitHub Actions 자동 수집
        </p>
        <p className="mono">
          {formatDateTime(snapshot.generatedAt)} 수집 · {formatInCentral(snapshot.generatedAt)} · 제품{' '}
          {snapshot.counts.total}종
          {snapshot.counts.errored > 0 && (
            <span style={{ color: 'var(--hold)' }}> · 수집 경고 {snapshot.counts.errored}건</span>
          )}
        </p>
      </div>
    </footer>
  );
}
