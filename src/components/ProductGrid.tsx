import type { Product } from '../lib/types';
import { formatAge, formatDate, formatEolRemaining } from '../lib/format';
import { ProductDetail } from './ProductDetail';
import { ProductIcon } from './ProductIcon';
import { ScoreBar, VerdictBadge } from './VerdictBadge';

function Card({
  product,
  expanded,
  onToggle,
  refFn,
}: {
  product: Product;
  expanded: boolean;
  onToggle: () => void;
  refFn: (el: HTMLElement | null) => void;
}) {
  const { latest, recommended } = product;
  const upgradeNeeded = recommended && latest && recommended.version !== latest.version;
  const eolDays = recommended?.eolInDays ?? latest?.eolInDays ?? null;

  return (
    <article
      ref={refFn}
      data-verdict={product.verdict}
      className={expanded ? 'lg:col-span-2 xl:col-span-3' : ''}
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-panel)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left transition-colors hover:bg-[var(--surface-hover)]"
      >
        <span className="block h-[3px] w-full" style={{ background: 'var(--v)' }} aria-hidden />

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-2.5">
            <ProductIcon product={product} size={24} />
            <div className="min-w-0 flex-1 leading-tight">
              <h3 className="truncate text-[14px] font-semibold">{product.name}</h3>
              <p className="truncate text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                {product.blurb}
              </p>
            </div>
            <VerdictBadge verdict={product.verdict} score={latest?.score} size="sm" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="mono text-[19px] font-bold tracking-tight">{latest?.version ?? '—'}</span>
            <span className="mono text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
              {formatDate(latest?.releaseDate)} · {formatAge(latest?.ageDays)} 전
            </span>
          </div>

          {latest && <ScoreBar verdict={product.verdict} score={latest.score} />}

          <dl className="grid grid-cols-2 gap-2 text-[11.5px]">
            <div>
              <dt style={{ color: 'var(--text-faint)' }}>도입 권장</dt>
              <dd
                className="mono font-medium"
                style={{ color: recommended ? (upgradeNeeded ? 'var(--go)' : 'var(--text-muted)') : 'var(--nogo)' }}
              >
                {recommended ? recommended.version : '대안 없음'}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-faint)' }}>지원 잔여</dt>
              <dd
                className="mono font-medium"
                style={{ color: eolDays !== null && eolDays < 180 ? 'var(--hold)' : 'var(--text-muted)' }}
              >
                {formatEolRemaining(eolDays)}
              </dd>
            </div>
          </dl>
        </div>
      </button>

      {expanded && (
        <div className="expand-in" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <ProductDetail product={product} />
        </div>
      )}
    </article>
  );
}

export function ProductGrid({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
      {products.map((p) => (
        <Card
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
    </div>
  );
}
