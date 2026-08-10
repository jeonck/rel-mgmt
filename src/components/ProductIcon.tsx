import type { Product } from '../lib/types';

/**
 * 제품 아이콘. 단색 SVG를 CSS 마스크로 찍어 테마 색을 그대로 입힌다.
 * 아이콘이 없는 제품은 이니셜 폴백 — 자리 크기는 항상 같아서 표가 흔들리지 않는다.
 */
export function ProductIcon({ product, size = 22 }: { product: Product; size?: number }) {
  const box = { width: size, height: size } as const;

  if (product.iconId) {
    const url = `${import.meta.env.BASE_URL}icons/${product.iconId}.svg`;
    return (
      <span
        aria-hidden
        className="product-icon shrink-0"
        style={{
          ...box,
          color: 'var(--text-muted)',
          WebkitMaskImage: `url(${url})`,
          maskImage: `url(${url})`,
        }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[5px] text-[10px] font-bold"
      style={{
        ...box,
        background: 'var(--surface-hover)',
        color: 'var(--text-faint)',
        border: '1px solid var(--border)',
      }}
    >
      {product.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'}
    </span>
  );
}
