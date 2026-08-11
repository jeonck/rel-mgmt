import type { Verdict } from '../lib/types';

/**
 * 판정 배지.
 * 색만으로 구분하지 않는다 — 도형과 텍스트를 함께 써서 색각 이상/흑백 인쇄에서도 읽힌다.
 */
const GLYPH: Record<Verdict, string> = {
  GO: '●',
  HOLD: '▲',
  'NO-GO': '■',
  UNKNOWN: '?',
};

const LABEL: Record<Verdict, string> = {
  GO: 'GO',
  HOLD: 'HOLD',
  'NO-GO': 'NO-GO',
  UNKNOWN: 'NO DATA',
};

export const VERDICT_DESCRIPTION: Record<Verdict, string> = {
  GO: 'Safe to adopt now',
  HOLD: 'Conditional — read the reasoning before deciding',
  'NO-GO': 'Do not adopt this version yet',
  UNKNOWN: 'Not enough data to judge',
};

export function VerdictBadge({
  verdict,
  score,
  size = 'md',
}: {
  verdict: Verdict;
  score?: number;
  size?: 'sm' | 'md';
}) {
  const small = size === 'sm';
  return (
    <span
      data-verdict={verdict}
      title={VERDICT_DESCRIPTION[verdict]}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap',
        small ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-1 text-[11.5px]',
      ].join(' ')}
      style={{
        color: 'var(--v)',
        background: 'var(--v-soft)',
        borderColor: 'var(--v-line)',
      }}
    >
      <span aria-hidden className={small ? 'text-[7px]' : 'text-[8px]'}>
        {GLYPH[verdict]}
      </span>
      <span className="tracking-wide">{LABEL[verdict]}</span>
      {score !== undefined && verdict !== 'UNKNOWN' && (
        <span className="mono opacity-70 font-medium">{score}</span>
      )}
    </span>
  );
}

/** 점수 100점 만점 막대 — 배지 옆에서 한눈에 정도를 보여준다. */
export function ScoreBar({ verdict, score }: { verdict: Verdict; score: number }) {
  return (
    <span
      data-verdict={verdict}
      className="inline-block h-1 w-12 overflow-hidden rounded-full align-middle"
      style={{ background: 'var(--border)' }}
      role="img"
      aria-label={`Risk score ${score} out of 100`}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(3, score)}%`, background: 'var(--v)' }}
      />
    </span>
  );
}
