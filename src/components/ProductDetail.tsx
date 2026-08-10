import { formatAge, formatDate, formatEolRemaining } from '../lib/format';
import type { Product, Reason, ReleaseCandidate } from '../lib/types';
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
              최신 <span className="mono normal-case" style={{ color: 'var(--text-muted)' }}>{latest.version}</span>
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
              대안 · 지금 도입 가능
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
            추적 중인 릴리즈 트레인 중 지금 도입 기준을 통과하는 버전이 없습니다. 기존 버전 유지 후 다음 패치를 기다리세요.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <LinkChip href={product.homepage}>공식 사이트</LinkChip>
          {latest?.notesUrl && <LinkChip href={latest.notesUrl}>릴리즈 노트</LinkChip>}
          {product.sources.github && <LinkChip href={product.sources.github}>GitHub Releases</LinkChip>}
          {product.sources.endoflife && <LinkChip href={product.sources.endoflife}>EOL 일정</LinkChip>}
          {product.sources.releasePolicy && <LinkChip href={product.sources.releasePolicy}>릴리즈 정책</LinkChip>}
        </div>
      </div>

      {/* 트레인 타임라인 */}
      <section>
        <h4 className="mb-2 text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
          지원 중인 릴리즈 트레인
        </h4>
        <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ background: 'var(--surface)', color: 'var(--text-faint)' }}>
                <th className="px-2.5 py-1.5 text-left font-semibold">트레인</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">최신</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">출시</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">EOL</th>
                <th className="px-2.5 py-1.5 text-right font-semibold">잔여</th>
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
                    {t.isEol ? '종료' : formatEolRemaining(t.eolInDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {latest && (
          <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
            최신 릴리즈 {formatDate(latest.releaseDate)} · 출시 후 {formatAge(latest.ageDays)} 경과
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
