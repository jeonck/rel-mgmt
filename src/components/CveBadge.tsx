import type { CveSeverity, SecurityReport } from '../lib/types';

const SEVERITY_COLOR: Record<CveSeverity, string> = {
  CRITICAL: 'var(--nogo)',
  HIGH: 'var(--nogo)',
  MEDIUM: 'var(--hold)',
  LOW: 'var(--hold)',
  UNSCORED: 'var(--unknown)',
};

const SEVERITY_LABEL: Record<CveSeverity, string> = {
  CRITICAL: 'CRIT',
  HIGH: 'HIGH',
  MEDIUM: 'MED',
  LOW: 'LOW',
  UNSCORED: 'N/S',
};

const ORDER: CveSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNSCORED'];

export function worstSeverity(report: SecurityReport): CveSeverity | null {
  return ORDER.find((s) => report.counts[s] > 0) ?? null;
}

/**
 * CVE 요약 배지.
 *
 * "0건"은 안전의 증거가 아니라 "NVD에 등재된 항목이 없음"이다 — NVD의 CPE 데이터는
 * 신규 릴리즈에 대해 수 주 늦는다. 그래서 clean 상태는 초록 배지가 아니라
 * 눈에 띄지 않는 대시로 표시하고, 툴팁에서 의미를 정확히 밝힌다.
 */
export function CveBadge({ report, size = 'md' }: { report: SecurityReport; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  const pad = small ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-1 text-[11.5px]';

  if (report.status === 'unmapped') {
    return (
      <span
        className="mono text-[11px]"
        style={{ color: 'var(--text-faint)' }}
        title="No CPE mapping exists for this product, so NVD cannot be queried."
      >
        n/a
      </span>
    );
  }

  if (report.status === 'skipped') {
    return (
      <span
        className="mono text-[11px]"
        style={{ color: 'var(--text-faint)' }}
        title="Only the headline and recommended versions are checked against NVD."
      >
        —
      </span>
    );
  }

  if (report.status === 'error') {
    return (
      <span
        className={`mono inline-flex items-center gap-1 rounded-md border font-semibold ${pad}`}
        style={{ color: 'var(--hold)', background: 'var(--hold-soft)', borderColor: 'var(--hold-line)' }}
        title={report.note ?? 'NVD lookup failed on this run.'}
      >
        ⚠ NVD
      </span>
    );
  }

  const worst = worstSeverity(report);

  if (!worst) {
    return (
      <span
        className="mono text-[11px]"
        style={{ color: 'var(--text-faint)' }}
        title="No CVEs recorded in NVD against this version. NVD data lags new releases by weeks — absence is not proof of safety."
      >
        none
      </span>
    );
  }

  const color = SEVERITY_COLOR[worst];
  const breakdown = ORDER.filter((s) => report.counts[s] > 0)
    .map((s) => `${report.counts[s]} ${s.toLowerCase()}`)
    .join(', ');

  return (
    <span
      className={`mono inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap ${pad}`}
      style={{
        color,
        background: 'color-mix(in srgb, currentColor 13%, transparent)',
        borderColor: 'color-mix(in srgb, currentColor 40%, transparent)',
      }}
      title={`Affected by ${breakdown} (NVD)`}
    >
      {report.counts.total}
      <span className="opacity-75">{SEVERITY_LABEL[worst]}</span>
    </span>
  );
}

export function CveSeverityDot({ severity }: { severity: CveSeverity }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: SEVERITY_COLOR[severity] }}
    />
  );
}

export { SEVERITY_COLOR, SEVERITY_LABEL };
