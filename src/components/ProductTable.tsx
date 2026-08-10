import { CATEGORIES, type Product } from '../lib/types';
import { formatAge, formatDate } from '../lib/format';
import { EolMeter } from './EolMeter';
import { ProductDetail } from './ProductDetail';
import { ProductIcon } from './ProductIcon';
import { ScoreBar, VerdictBadge } from './VerdictBadge';

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.short]));

function Row({
  product,
  expanded,
  onToggle,
  refFn,
}: {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
  refFn: (el: HTMLTableSectionElement | null) => void;
}) {
  const { latest, recommended } = product;
  const detailId = `detail-${product.id}`;
  const upgradeNeeded = recommended && latest && recommended.version !== latest.version;

  return (
    <tbody ref={refFn} style={{ borderTop: '1px solid var(--border)' }}>
      <tr
        onClick={onToggle}
        className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)]"
        style={{ background: expanded ? 'var(--surface)' : 'transparent' }}
      >
        {/* 판정 — 맨 왼쪽 색 띠로 스캔 지점을 고정한다 */}
        <td
          className="w-[3px] p-0"
          data-verdict={product.verdict}
          style={{ background: 'var(--v)' }}
          aria-hidden
        />

        <td className="py-2.5 pr-3 pl-3">
          <div className="flex items-center gap-2.5">
            <ProductIcon product={product} />
            <div className="min-w-0 leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13.5px] font-semibold">{product.name}</span>
                {product.errors.length > 0 && (
                  <span title={product.errors.join('\n')} style={{ color: 'var(--hold)' }} aria-label="수집 경고">
                    ⚠
                  </span>
                )}
              </div>
              <span className="block truncate text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {product.vendor} · {CATEGORY_LABEL[product.category]}
              </span>
            </div>
          </div>
        </td>

        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="mono text-[13px] font-semibold">{latest?.version ?? '—'}</span>
            {latest?.isLts && (
              <span
                className="rounded px-1 text-[9.5px] font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                LTS
              </span>
            )}
          </div>
          <span className="mono block text-[11px]" style={{ color: 'var(--text-faint)' }}>
            {formatDate(latest?.releaseDate)} · {formatAge(latest?.ageDays)} 전
          </span>
        </td>

        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <VerdictBadge verdict={product.verdict} score={latest?.score} />
            {latest && <ScoreBar verdict={product.verdict} score={latest.score} />}
          </div>
        </td>

        <td className="px-3 py-2.5">
          {recommended ? (
            <span className="flex items-center gap-1.5">
              <span
                className="mono text-[12.5px] font-medium"
                style={{ color: upgradeNeeded ? 'var(--go)' : 'var(--text-faint)' }}
              >
                {recommended.version}
              </span>
              {!upgradeNeeded && (
                <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
                  (최신과 동일)
                </span>
              )}
            </span>
          ) : (
            <span className="text-[11.5px]" style={{ color: 'var(--nogo)' }}>
              대안 없음
            </span>
          )}
        </td>

        <td className="px-3 py-2.5">
          <EolMeter
            days={recommended?.eolInDays ?? latest?.eolInDays ?? null}
            date={recommended?.eolDate ?? latest?.eolDate ?? null}
          />
        </td>

        <td className="w-9 pr-3 text-right">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={detailId}
            aria-label={`${product.name} 상세 ${expanded ? '접기' : '펼치기'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="grid h-6 w-6 place-items-center rounded transition-transform"
            style={{ color: 'var(--text-faint)', transform: expanded ? 'rotate(90deg)' : 'none' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
      </tr>

      {expanded && (
        <tr id={detailId} className="expand-in">
          <td colSpan={7} style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
            <ProductDetail product={product} />
          </td>
        </tr>
      )}
    </tbody>
  );
}

export function ProductTable({
  products,
  expandedId,
  onToggle,
  rowRefs,
}: {
  products: Product[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  rowRefs: React.RefObject<Map<string, HTMLElement>>;
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl"
      style={{ background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-panel)' }}
    >
      <table className="w-full min-w-[860px] border-collapse text-left">
        <caption className="sr-only">데브옵스 소프트웨어별 최신 릴리즈와 도입 판정</caption>
        <thead>
          <tr
            className="text-[10.5px] font-semibold tracking-wide uppercase"
            style={{ color: 'var(--text-faint)', background: 'var(--surface)' }}
          >
            <th className="w-[3px] p-0" />
            <th scope="col" className="px-3 py-2 font-semibold">제품</th>
            <th scope="col" className="px-3 py-2 font-semibold">최신 버전</th>
            <th scope="col" className="px-3 py-2 font-semibold">판정</th>
            <th scope="col" className="px-3 py-2 font-semibold">도입 권장</th>
            <th scope="col" className="px-3 py-2 font-semibold">지원 잔여</th>
            <th className="w-9 p-0" />
          </tr>
        </thead>
        {products.map((p) => (
          <Row
            key={p.id}
            product={p}
            expanded={expandedId === p.id}
            onToggle={() => onToggle(p.id)}
            refFn={(el) => {
              if (el) rowRefs.current.set(p.id, el);
              else rowRefs.current.delete(p.id);
            }}
          />
        ))}
      </table>
    </div>
  );
}
