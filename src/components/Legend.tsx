import type { Snapshot } from '../lib/types';
import { formatDateTime, formatInCentral } from '../lib/format';
import { VERDICT_DESCRIPTION, VerdictBadge } from './VerdictBadge';

const RULES: { label: string; detail: string }[] = [
  { label: 'Pre-release', detail: 'RC / beta / alpha tags are an automatic NO-GO' },
  { label: 'Past EOL', detail: 'A version with no security support left is an automatic NO-GO' },
  { label: 'Critical CVE', detail: 'Any critical-severity CVE affecting the version is an automatic NO-GO' },
  { label: 'High / medium / low CVE', detail: '−40 / −15 / −5' },
  { label: 'New train soak', detail: '−45 under 7 days old, −25 under the soak target (30 days by default)' },
  { label: 'Patch soak', detail: 'Shorter bar for patches — −25 under 3 days, −12 under 10 days' },
  { label: 'Patch maturity', detail: '−20 for a .0 release, −10 below the patch-number target' },
  { label: 'Support runway', detail: '−55 / −30 / −15 under 30 / 90 / 180 days; +5 above a year' },
  { label: 'Support state', detail: '−20 once active support ends, −25 for an unmaintained train' },
  { label: 'LTS', detail: '+8 for a long-term support train' },
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
            How verdicts work
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
            Every version starts at 100 and loses points for risk:{' '}
            <strong style={{ color: 'var(--go)' }}>80 or above is GO</strong>,{' '}
            <strong style={{ color: 'var(--hold)' }}>50 or above is HOLD</strong>,{' '}
            <strong style={{ color: 'var(--nogo)' }}>below that is NO-GO</strong>. The headline verdict
            answers “can I ship the latest version today?” — when the answer is no, the{' '}
            <em>recommended</em> column gives you the newest version that does clear the bar.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
            Scoring rules
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
            Thresholds vary by product — databases and Kubernetes carry a 60–90 day soak bar because
            rolling them back is expensive. They live in{' '}
            <code className="mono rounded px-1" style={{ background: 'var(--surface)' }}>
              scripts/catalog.ts
            </code>
            .
          </p>
        </section>
      </div>

      <div
        className="rounded-xl p-4 text-[11.5px] leading-relaxed"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
      >
        <strong style={{ color: 'var(--text-muted)' }}>On the CVE column.</strong> Vulnerabilities come
        from the{' '}
        <a href="https://nvd.nist.gov" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
          NVD
        </a>
        , matched by CPE against the exact version shown. NVD publishes CPE records weeks after a
        release ships, and products without a CPE mapping are marked <span className="mono">n/a</span>.
        Read “none” as <em>nothing filed yet</em>, not as proof that a version is clean — and note that
        only the headline and recommended versions are queried, not every train.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
        <p>
          Data from{' '}
          <a href="https://endoflife.date" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            endoflife.date
          </a>
          ,{' '}
          <a href="https://docs.github.com/rest/releases" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            GitHub Releases
          </a>{' '}
          and{' '}
          <a href="https://nvd.nist.gov/developers/vulnerabilities" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
            NVD
          </a>
          . Collected nightly at 02:00 CDT (07:00 UTC) by GitHub Actions.
        </p>
        <p className="mono">
          {formatDateTime(snapshot.generatedAt)} · {formatInCentral(snapshot.generatedAt)} ·{' '}
          {snapshot.counts.total} products
          {snapshot.counts.errored > 0 && (
            <span style={{ color: 'var(--hold)' }}> · {snapshot.counts.errored} with warnings</span>
          )}
        </p>
      </div>
    </footer>
  );
}
