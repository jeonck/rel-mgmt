import { formatDate, formatEolRemaining } from '../lib/format';

const HORIZON_DAYS = 1095; // 3년을 막대 전체 길이로 본다

function toneOf(days: number): 'go' | 'hold' | 'nogo' {
  if (days < 90) return 'nogo';
  if (days < 180) return 'hold';
  return 'go';
}

/**
 * 잔여 지원 기간 미터.
 * 숫자만 보면 "512일"이 긴지 짧은지 감이 안 온다 — 3년 지평 대비 막대로 같이 보여준다.
 */
export function EolMeter({ days, date }: { days: number | null; date: string | null }) {
  if (days === null) {
    return (
      <span className="mono text-[11px]" style={{ color: 'var(--text-faint)' }}>
        미공개
      </span>
    );
  }

  const tone = toneOf(days);
  const pct = Math.max(2, Math.min(100, (days / HORIZON_DAYS) * 100));
  const expired = days < 0;

  return (
    <span
      className="flex flex-col gap-1"
      title={date ? `EOL ${formatDate(date)}` : undefined}
      style={{
        // toneOf 결과를 판정 색 변수에 매핑
        ['--v' as string]: `var(--${tone})`,
        ['--v-soft' as string]: `var(--${tone}-soft)`,
      }}
    >
      <span className="mono text-[11.5px] leading-none" style={{ color: expired ? 'var(--nogo)' : 'var(--text)' }}>
        {formatEolRemaining(days)}
      </span>
      <span
        className="block h-[3px] w-16 overflow-hidden rounded-full"
        style={{ background: 'var(--border)' }}
        role="img"
        aria-label={expired ? `지원 종료 ${Math.abs(days)}일 경과` : `지원 잔여 ${days}일`}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: expired ? '100%' : `${pct}%`, background: 'var(--v)' }}
        />
      </span>
    </span>
  );
}
