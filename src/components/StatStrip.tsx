import type { Snapshot, Verdict } from '../lib/types';

export type QuickFilter = Verdict | 'ALL' | 'EOL_SOON' | 'CHANGED';

interface Tile {
  key: QuickFilter;
  label: string;
  value: number;
  hint: string;
  tone: 'neutral' | 'go' | 'hold' | 'nogo' | 'accent';
}

const TONE_VARS: Record<Tile['tone'], { fg: string; soft: string; line: string }> = {
  neutral: { fg: 'var(--text)', soft: 'transparent', line: 'var(--border)' },
  go: { fg: 'var(--go)', soft: 'var(--go-soft)', line: 'var(--go-line)' },
  hold: { fg: 'var(--hold)', soft: 'var(--hold-soft)', line: 'var(--hold-line)' },
  nogo: { fg: 'var(--nogo)', soft: 'var(--nogo-soft)', line: 'var(--nogo-line)' },
  accent: { fg: 'var(--accent)', soft: 'var(--accent-soft)', line: 'var(--accent)' },
};

/**
 * 최상단 요약 타일. 전부 클릭 가능한 필터다 —
 * "NO-GO 7건"을 보고 바로 그 7건으로 좁히는 게 이 화면의 핵심 동선이다.
 */
export function StatStrip({
  snapshot,
  active,
  onSelect,
}: {
  snapshot: Snapshot;
  active: QuickFilter;
  onSelect: (f: QuickFilter) => void;
}) {
  const c = snapshot.counts;
  const tiles: Tile[] = [
    { key: 'ALL', label: '추적 대상', value: c.total, hint: '전체 제품', tone: 'neutral' },
    { key: 'GO', label: 'GO', value: c.go, hint: '최신 버전 도입 가능', tone: 'go' },
    { key: 'HOLD', label: 'HOLD', value: c.hold, hint: '조건부 — 근거 확인 필요', tone: 'hold' },
    { key: 'NO-GO', label: 'NO-GO', value: c.nogo, hint: '최신 버전 도입 보류', tone: 'nogo' },
    { key: 'EOL_SOON', label: 'EOL 임박', value: c.eolSoon, hint: '지원 잔여 180일 이하', tone: 'hold' },
    {
      key: 'CHANGED',
      label: '오늘 변경',
      value: snapshot.changes.length,
      hint: '직전 수집 대비 변동',
      tone: 'accent',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => {
        const isActive = active === t.key;
        const vars = TONE_VARS[t.tone];
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(isActive && t.key !== 'ALL' ? 'ALL' : t.key)}
            aria-pressed={isActive}
            title={t.hint}
            className="group flex flex-col gap-1 rounded-xl px-3.5 py-3 text-left transition-all hover:-translate-y-px"
            style={{
              background: isActive ? vars.soft : 'var(--panel)',
              border: `1px solid ${isActive ? vars.line : 'var(--border)'}`,
              boxShadow: isActive ? 'none' : 'var(--shadow-panel)',
            }}
          >
            <span
              className="text-[10.5px] font-semibold tracking-wide uppercase"
              style={{ color: isActive ? vars.fg : 'var(--text-faint)' }}
            >
              {t.label}
            </span>
            <span
              className="mono text-2xl leading-none font-bold tabular-nums"
              style={{ color: t.tone === 'neutral' ? 'var(--text)' : vars.fg }}
            >
              {t.value}
            </span>
            <span className="truncate text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
              {t.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
