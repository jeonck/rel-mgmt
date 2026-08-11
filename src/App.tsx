import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChangeFeed } from './components/ChangeFeed';
import { Header } from './components/Header';
import { Legend } from './components/Legend';
import { ProductGrid } from './components/ProductGrid';
import { ProductTable } from './components/ProductTable';
import { StatStrip, type QuickFilter } from './components/StatStrip';
import { Toolbar, type SortKey, type ViewMode } from './components/Toolbar';
import { useSnapshot } from './lib/useSnapshot';
import { CATEGORIES, type CategoryId, type Product, type Verdict } from './lib/types';

const RISK_ORDER: Record<Verdict, number> = { 'NO-GO': 0, HOLD: 1, UNKNOWN: 2, GO: 3 };
const EOL_SOON_DAYS = 180;

function matchesQuery(p: Product, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    p.name.toLowerCase().includes(needle) ||
    p.id.includes(needle) ||
    p.vendor.toLowerCase().includes(needle) ||
    p.blurb.toLowerCase().includes(needle) ||
    (p.latest?.version.toLowerCase().includes(needle) ?? false) ||
    (p.recommended?.version.toLowerCase().includes(needle) ?? false)
  );
}

function eolDaysOf(p: Product): number | null {
  return p.recommended?.eolInDays ?? p.latest?.eolInDays ?? null;
}

export default function App() {
  const state = useSnapshot();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [quick, setQuick] = useState<QuickFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('risk');
  // 좁은 화면에서 조밀한 표는 가로 스크롤을 강요한다 — 첫 화면만 카드로 연다
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table',
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark',
  );

  const rowRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('relboard.theme', theme);
    } catch {
      /* 프라이빗 모드 등에서 실패해도 무시 */
    }
  }, [theme]);

  const snapshot = state.status === 'ready' ? state.snapshot : null;
  const products = snapshot?.products ?? [];

  const changedIds = useMemo(
    () => new Set(snapshot?.changes.map((c) => c.productId) ?? []),
    [snapshot],
  );

  /** 카테고리 탭에 붙는 개수 — 검색어/빠른필터가 적용된 뒤 기준으로 센다 */
  const preCategory = useMemo(
    () =>
      products.filter((p) => {
        if (!matchesQuery(p, query)) return false;
        if (quick === 'EOL_SOON') {
          const d = eolDaysOf(p);
          return d !== null && d <= EOL_SOON_DAYS;
        }
        if (quick === 'CHANGED') return changedIds.has(p.id);
        if (quick === 'CVE') return (p.latest?.security.counts.total ?? 0) > 0;
        if (quick !== 'ALL') return p.verdict === quick;
        return true;
      }),
    [products, query, quick, changedIds],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: preCategory.length };
    for (const c of CATEGORIES) counts[c.id] = 0;
    for (const p of preCategory) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return counts;
  }, [preCategory]);

  const visible = useMemo(() => {
    const list = preCategory.filter((p) => category === 'all' || p.category === category);

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'risk': {
          const d = RISK_ORDER[a.verdict] - RISK_ORDER[b.verdict];
          if (d !== 0) return d;
          return (a.latest?.score ?? 0) - (b.latest?.score ?? 0);
        }
        case 'recent':
          return (a.latest?.ageDays ?? 1e9) - (b.latest?.ageDays ?? 1e9);
        case 'eol': {
          const av = eolDaysOf(a) ?? 1e9;
          const bv = eolDaysOf(b) ?? 1e9;
          return av - bv;
        }
        case 'name':
          return a.name.localeCompare(b.name, 'en');
      }
    });
    return sorted;
  }, [preCategory, category, sort]);

  const toggle = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  /** 변경 피드에서 제품을 고르면 필터를 풀고 해당 행으로 스크롤 + 펼치기 */
  const focusProduct = useCallback((id: string) => {
    setQuery('');
    setCategory('all');
    setQuick('ALL');
    setExpandedId(id);

    requestAnimationFrame(() => {
      const el = rowRefs.current.get(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  return (
    <div className="app-bg min-h-screen">
      <Header
        generatedAt={snapshot?.generatedAt ?? null}
        query={query}
        onQueryChange={setQuery}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        resultCount={visible.length}
        totalCount={products.length}
      />

      <main className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6">
        {state.status === 'loading' && (
          <div
            className="grid h-64 place-items-center rounded-xl text-[13px]"
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
          >
            Loading release data…
          </div>
        )}

        {state.status === 'error' && (
          <div
            className="rounded-xl p-6 text-[13px]"
            style={{ background: 'var(--nogo-soft)', border: '1px solid var(--nogo-line)', color: 'var(--nogo)' }}
          >
            <p className="font-semibold">Could not load the release snapshot</p>
            <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
              {state.message} — if the collector has never run, execute{' '}
              <code className="mono">npm run collect</code> first.
            </p>
          </div>
        )}

        {snapshot && (
          <>
            <StatStrip
              snapshot={snapshot}
              active={quick}
              onSelect={(f) => {
                setQuick(f);
                setExpandedId(null);
              }}
            />

            <ChangeFeed changes={snapshot.changes} onSelectProduct={focusProduct} />

            <Toolbar
              category={category}
              onCategory={setCategory}
              counts={categoryCounts}
              sort={sort}
              onSort={setSort}
              view={view}
              onView={setView}
            />

            {visible.length === 0 ? (
              <div
                className="grid h-48 place-items-center rounded-xl text-[13px]"
                style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
              >
                No products match these filters.
              </div>
            ) : view === 'table' ? (
              <ProductTable products={visible} expandedId={expandedId} onToggle={toggle} rowRefs={rowRefs} />
            ) : (
              <ProductGrid products={visible} expandedId={expandedId} onToggle={toggle} rowRefs={rowRefs} />
            )}

            <Legend snapshot={snapshot} />
          </>
        )}
      </main>
    </div>
  );
}
