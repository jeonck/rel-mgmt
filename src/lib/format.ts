const KO = 'ko-KR';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(KO, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .replace(/\.$/, '');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(KO, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** 수집 기준 시간대(CDT/CST)로 표기 — 스케줄이 이 시간대 기준이라 함께 보여준다. */
export function formatInCentral(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(d);
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';

  const diffMin = Math.round((t - now) / 60_000);
  const abs = Math.abs(diffMin);
  const rtf = new Intl.RelativeTimeFormat(KO, { numeric: 'auto' });

  // Intl은 0분을 "현재 분"으로 내놓는다 — 사람이 쓰는 말로 바꾼다
  if (abs < 1) return '방금';
  if (abs < 60) return rtf.format(diffMin, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), 'hour');
  if (abs < 60 * 24 * 30) return rtf.format(Math.round(diffMin / (60 * 24)), 'day');
  return rtf.format(Math.round(diffMin / (60 * 24 * 30)), 'month');
}

/** 릴리즈 경과일을 짧게 — 표 안에서 폭을 적게 먹어야 한다. */
export function formatAge(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—';
  if (days < 0) return '예정';
  if (days === 0) return '오늘';
  if (days < 30) return `${days}일`;
  if (days < 365) return `${Math.floor(days / 30)}개월`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}년 ${months}개월` : `${years}년`;
}

export function formatEolRemaining(days: number | null | undefined): string {
  if (days === null || days === undefined) return '미공개';
  if (days < 0) return `${Math.abs(days)}일 경과`;
  if (days < 60) return `${days}일`;
  if (days < 730) return `${Math.round(days / 30)}개월`;
  return `${(days / 365).toFixed(1)}년`;
}

/**
 * 다음 수집 예정 시각. GitHub Actions 크론이 매일 UTC 07:00
 * (= CDT 02:00 / CST 01:00)에 돈다.
 */
export const COLLECT_HOUR_UTC = 7;

export function nextCollectionAt(from = new Date()): Date {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), COLLECT_HOUR_UTC, 0, 0),
  );
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function countdownTo(target: Date, now = Date.now()): string {
  const ms = target.getTime() - now;
  if (ms <= 0) return '곧';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}
