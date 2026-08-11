import { formatAgeAgo, formatDate, formatEolRemaining } from '../lib/format';
import type { Product, Reason, ReleaseCandidate } from '../lib/types';
import { CveSeverityDot, SEVERITY_COLOR } from './CveBadge';
import { VerdictBadge } from './VerdictBadge';

const TONE_COLOR: Record<Reason['tone'], string> = {
  good: 'var(--go)',
  warn: 'var(--hold)',
  bad: 'var(--nogo)',
  info: 'var(--text-faint)',
};

function ReasonList({ candidate }: { candidate: ReleaseCandidate }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {candidate.reasons.map((r) => (
        <li key={r.code} className="flex items-start gap-2 text-[12.5px] leading-snug">
          <span
            aria-hidden
            className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: TONE_COLOR[r.tone] }}
          />
          <span style={{ color: r.tone === 'info' ? 'var(--text-faint)' : 'var(--text-muted)' }}>
            {r.label}
          </span>
          {r.delta !== 0 && (
            <span className="mono ml-auto shrink-0 text-[11px]" style={{ color: TONE_COLOR[r.tone] }}>
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 알려진 취약점 목록.
 *
 * 0건일 때 "안전"이라고 쓰지 않는다 — NVD의 CPE 매핑은 신규 릴리즈에 수 주 늦기 때문에
 * 0건은 "아직 등재된 것이 없음"까지만 보장한다. 문구가 그 한계를 그대로 말하게 둔다.
 */
function CveSection({ candidate }: { candidate: ReleaseCandidate }) {
  const sec = candidate.security;

  const note = (text: string, tone = 'var(--text-faint)') => (
    <p className="text-[12px] leading-snug" style={{ color: tone }}>
      {text}
    </p>
  );

  return (
    <section>
      <h4
        className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase"
        style={{ color: 'var(--text-faint)' }}
      >
        Known vulnerabilities
        {sec.status === 'ok' && (
          <span className="mono font-normal normal-case" style={{ color: 'var(--text-muted)' }}>
            NVD · {candidate.version}
          </span>
        )}
      </h4>

      {sec.status === 'unmapped' &&
        note('No CPE mapping exists for this product, so NVD cannot be queried.')}
      {sec.status === 'skipped' &&
        note('Only the headline and recommended versions are checked against NVD.')}
      {sec.status === 'error' && note(sec.note ?? 'NVD lookup failed on this run.', 'var(--hold)')}

      {sec.status === 'ok' && sec.counts.total === 0 &&
        note(
          'No CVEs recorded in NVD against this version. NVD entries lag new releases by weeks, so treat this as “nothing filed yet”, not proof of safety.',
        )}

      {sec.status === 'ok' && sec.counts.total > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {sec.top.map((cve) => (
              <li key={cve.id} className="flex items-start gap-2">
                <CveSeverityDot severity={cve.severity} />
                <div className="min-w-0">
                  <a
                    href={cve.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mono text-[12px] font-semibold underline-offset-2 hover:underline"
                    style={{ color: SEVERITY_COLOR[cve.severity] }}
                  >
                    {cve.id}
                  </a>
                  <span className="mono ml-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    {cve.score !== null ? `CVSS ${cve.score}` : 'not scored'}
                    {cve.published ? ` · ${formatDate(cve.published)}` : ''}
                  </span>
                  <p className="line-clamp-2 text-[11.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                    {cve.summary}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {sec.counts.total > sec.top.length && (
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              +{sec.counts.total - sec.top.length} more recorded against this version
              {sec.note ? ` · ${sec.note}` : ''}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function LinkChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-hover)]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
    >
      {children}
      <span aria-hidden style={{ color: 'var(--text-faint)' }}>
        ↗
      </span>
    </a>
  );
}

/** 행/카드를 펼쳤을 때 나오는 상세 — 판정 근거, 트레인 타임라인, 원본 링크. */
export function ProductDetail({ product }: { product: Product }) {
  const { latest, recommended } = product;

  return (
    <div className="grid gap-6 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* 판정 근거 */}
      <div className="flex flex-col gap-4">
        {latest && (
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
              Latest <span className="mono normal-case" style={{ color: 'var(--text-muted)' }}>{latest.version}</span>
              <VerdictBadge verdict={latest.verdict} score={latest.score} size="sm" />
            </h4>
            <ReasonList candidate={latest} />
          </section>
        )}

        {recommended && latest && recommended.version !== latest.version && (
          <section
            className="rounded-lg p-3"
            style={{ background: 'var(--go-soft)', border: '1px solid var(--go-line)' }}
          >
            <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--go)' }}>
              Recommended alternative
              <span className="mono normal-case">{recommended.version}</span>
            </h4>
            <ReasonList candidate={recommended} />
          </section>
        )}

        {!recommended && (
          <p
            className="rounded-lg p-3 text-[12.5px]"
            style={{ background: 'var(--nogo-soft)', border: '1px solid var(--nogo-line)', color: 'var(--nogo)' }}
          >
            None of the tracked release trains currently clear the adoption bar. Stay on your existing
            version and wait for the next patch.
          </p>
        )}

        {latest && <CveSection candidate={latest} />}

        <div className="flex flex-wrap gap-2">
          <LinkChip href={product.homepage}>Website</LinkChip>
          {latest?.notesUrl && <LinkChip href={latest.notesUrl}>Release notes</LinkChip>}
          {product.sources.github && <LinkChip href={product.sources.github}>GitHub Releases</LinkChip>}
          {product.sources.endoflife && <LinkChip href={product.sources.endoflife}>EOL schedule</LinkChip>}
          {product.sources.releasePolicy && <LinkChip href={product.sources.releasePolicy}>Release policy</LinkChip>}
        </div>
      </div>

      {/* 트레인 타임라인 */}
      <section>
        <h4 className="mb-2 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
          Release trains
        </h4>
        <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: 'var(--surface)', color: 'var(--text-faint)' }}>
                <th className="px-2.5 py-1.5 text-left font-semibold">Train</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">Latest</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">Released</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">EOL</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">Left</th>
              </tr>
            </thead>
            <tbody>
              {product.trains.map((t) => (
                <tr key={t.train} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="mono px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5">
                      {t.train}
                      {t.isLts && (
                        <span
                          className="rounded px-1 text-[9.5px] font-bold"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          LTS
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="mono px-2.5 py-1.5" style={{ color: 'var(--text-muted)' }}>
                    {t.latest ?? '—'}
                  </td>
                  <td className="mono px-2.5 py-1.5" style={{ color: 'var(--text-faint)' }}>
                    {formatDate(t.releaseDate)}
                  </td>
                  <td className="mono px-2.5 py-1.5" style={{ color: 'var(--text-faint)' }}>
                    {formatDate(t.eolDate)}
                  </td>
                  <td
                    className="mono px-2.5 py-1.5 text-right font-medium"
                    style={{ color: t.isEol ? 'var(--nogo)' : (t.eolInDays ?? 999) < 180 ? 'var(--hold)' : 'var(--text-muted)' }}
                  >
                    {t.isEol ? 'ended' : formatEolRemaining(t.eolInDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {latest && (
          <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            Latest release {formatDate(latest.releaseDate)} · {formatAgeAgo(latest.ageDays)}
          </p>
        )}

        {product.errors.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {product.errors.map((e) => (
              <li key={e} className="text-[11.5px]" style={{ color: 'var(--hold)' }}>
                ⚠ {e}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
