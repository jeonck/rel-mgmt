import { useEffect, useRef, useState } from 'react';
import { countdownTo, formatInCentral, nextCollectionAt, relativeTime } from '../lib/format';

export function Header({
  generatedAt,
  query,
  onQueryChange,
  theme,
  onToggleTheme,
  resultCount,
  totalCount,
}: {
  generatedAt: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tick, setTick] = useState(() => Date.now());

  // 다음 수집까지 남은 시간을 1분마다 갱신
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // `/` 로 검색창 진입, Esc 로 이탈 — 목록형 도구의 기본 관례
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && typing) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const next = nextCollectionAt(new Date(tick));

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-xl"
      style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 sm:px-6">
        {/* 로고 + 타이틀 */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: 'var(--go-soft)', border: '1px solid var(--go-line)' }}
          >
            <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: 'var(--go)' }} />
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold tracking-tight">Release Board</h1>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              DevOps Go / NoGo
            </p>
          </div>
        </div>

        {/* 검색 */}
        <div className="order-3 w-full lg:order-none lg:w-auto lg:flex-1">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors focus-within:border-[var(--accent)]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: 'var(--text-faint)' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              type="search"
              placeholder="Search product, vendor, or version"
              aria-label="Search products"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--text-faint)]"
              style={{ color: 'var(--text)' }}
            />
            {query ? (
              <span className="mono shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {resultCount}/{totalCount}
              </span>
            ) : (
              <kbd
                className="mono hidden shrink-0 rounded border px-1.5 text-[10px] sm:block"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-faint)' }}
              >
                /
              </kbd>
            )}
          </div>
        </div>

        {/* 수집 상태 */}
        <div className="ml-auto flex items-center gap-4">
          <dl className="text-right leading-tight">
            <dt className="text-[10px] tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
              Last collected
            </dt>
            <dd className="mono text-[12px]" style={{ color: 'var(--text)' }}>
              {generatedAt ? relativeTime(generatedAt) : '—'}
              <span className="ml-1.5 hidden text-[11px] md:inline" style={{ color: 'var(--text-faint)' }}>
                {formatInCentral(generatedAt)}
              </span>
            </dd>
          </dl>

          <dl className="hidden text-right leading-tight lg:block">
            <dt className="text-[10px] tracking-wide uppercase" style={{ color: 'var(--text-faint)' }}>
              Next run
            </dt>
            <dd className="mono text-[12px]" style={{ color: 'var(--text-muted)' }}>
              in {countdownTo(next, tick)}
            </dd>
          </dl>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            {theme === 'dark' ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
