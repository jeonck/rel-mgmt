import { CATEGORIES, type CategoryId } from '../lib/types';

export type SortKey = 'risk' | 'recent' | 'eol' | 'name';
export type ViewMode = 'table' | 'grid';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'risk', label: 'Highest risk' },
  { key: 'recent', label: 'Most recent release' },
  { key: 'eol', label: 'Support ending soonest' },
  { key: 'name', label: 'Name' },
];

export function Toolbar({
  category,
  onCategory,
  counts,
  sort,
  onSort,
  view,
  onView,
}: {
  category: CategoryId | 'all';
  onCategory: (c: CategoryId | 'all') => void;
  counts: Record<string, number>;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
}) {
  const tabs: { id: CategoryId | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    ...CATEGORIES.map((c) => ({ id: c.id as CategoryId | 'all', label: c.short })),
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* 카테고리 */}
      <div
        role="tablist"
        aria-label="Category"
        className="flex flex-wrap gap-1 rounded-xl p-1"
        style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
      >
        {tabs.map((t) => {
          const active = category === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onCategory(t.id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors"
              style={{
                background: active ? 'var(--surface-hover)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: active ? 'inset 0 0 0 1px var(--border-strong)' : 'none',
              }}
            >
              {t.label}
              <span className="mono text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                {counts[t.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        {/* 정렬 */}
        <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-faint)' }}>
          <span className="hidden sm:inline">Sort</span>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortKey)}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* 뷰 전환 */}
        <div
          className="flex rounded-lg p-0.5"
          style={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
          role="group"
          aria-label="Layout"
        >
          {(
            [
              { id: 'table' as const, label: 'Table', title: 'Dense table — best for comparing many products' },
              { id: 'grid' as const, label: 'Cards', title: 'Cards — per-product summary' },
            ]
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.title}
              aria-pressed={view === v.id}
              onClick={() => onView(v.id)}
              className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: view === v.id ? 'var(--surface-hover)' : 'transparent',
                color: view === v.id ? 'var(--text)' : 'var(--text-faint)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
