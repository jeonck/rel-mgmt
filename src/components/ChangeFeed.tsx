import type { ChangeEvent, ChangeKind } from '../lib/types';

const KIND_STYLE: Record<ChangeKind, { icon: string; color: string; label: string }> = {
  'new-version': { icon: '↑', color: 'var(--accent)', label: '신규 버전' },
  'verdict-up': { icon: '▲', color: 'var(--go)', label: '판정 상향' },
  'verdict-down': { icon: '▼', color: 'var(--nogo)', label: '판정 하향' },
  'eol-soon': { icon: '!', color: 'var(--hold)', label: 'EOL 임박' },
  'new-product': { icon: '+', color: 'var(--text-muted)', label: '추적 추가' },
};

/**
 * 직전 수집 대비 변경 사항.
 * 매일 여는 화면에서 "어제와 뭐가 달라졌나"가 가장 먼저 필요한 정보라
 * 표보다 위에, 가로 스크롤 칩으로 둔다.
 */
export function ChangeFeed({
  changes,
  onSelectProduct,
}: {
  changes: ChangeEvent[];
  onSelectProduct: (productId: string) => void;
}) {
  if (changes.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px]"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
      >
        <span aria-hidden style={{ color: 'var(--go)' }}>
          ●
        </span>
        직전 수집 대비 변경 없음 — 모든 제품이 어제와 동일합니다.
      </div>
    );
  }

  return (
    <section
      className="rounded-xl"
      style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-panel)' }}
      aria-label="직전 수집 대비 변경 사항"
    >
      <div className="flex items-center gap-2 px-4 pt-3">
        <h2 className="text-[11px] font-bold tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
          직전 수집 대비 변경
        </h2>
        <span
          className="mono rounded px-1.5 text-[10.5px] font-semibold"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          {changes.length}
        </span>
      </div>

      <ul className="flex gap-2 overflow-x-auto px-4 py-3">
        {changes.map((c, i) => {
          const style = KIND_STYLE[c.kind];
          return (
            <li key={`${c.productId}-${c.kind}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelectProduct(c.productId)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] font-bold"
                  style={{ color: style.color, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}
                >
                  {style.icon}
                </span>
                <span className="leading-tight">
                  <span className="block text-[12.5px] font-semibold">{c.productName}</span>
                  <span className="mono block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {c.message}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
