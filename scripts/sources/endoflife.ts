import { fetchJson } from '../lib/http.js';

const BASE = 'https://endoflife.date/api/v1/products';

interface EolV1Release {
  name: string;
  label?: string | null;
  releaseDate: string | null;
  isLts: boolean;
  isEoas: boolean;
  eoasFrom: string | null;
  isEol: boolean;
  eolFrom: string | null;
  isMaintained: boolean;
  latest: { name: string; date: string | null; link: string | null } | null;
}

interface EolV1Response {
  result: {
    name: string;
    label: string;
    links?: { icon?: string | null; html?: string | null; releasePolicy?: string | null };
    identifiers?: { type: string; id: string }[];
    releases: EolV1Release[];
  };
}

export interface EolTrain {
  train: string;
  releaseDate: string | null;
  isLts: boolean;
  isMaintained: boolean;
  /** 일반 지원 종료일 */
  supportEndDate: string | null;
  isSupportEnded: boolean;
  /** 보안 지원 종료일 */
  eolDate: string | null;
  isEol: boolean;
  latestVersion: string | null;
  latestDate: string | null;
  notesUrl: string | null;
}

export interface EolProduct {
  slug: string;
  label: string;
  iconUrl: string | null;
  htmlUrl: string | null;
  releasePolicyUrl: string | null;
  /** NVD CVE 조회에 쓰는 CPE (cpe:2.3:a:vendor:product). 없을 수 있다. */
  cpe: string | null;
  trains: EolTrain[];
}

/** endoflife.date에서 제품의 릴리즈 트레인 + EOL 일정을 가져온다. */
export async function fetchEndOfLife(slug: string): Promise<EolProduct | null> {
  const data = await fetchJson<EolV1Response>(`${BASE}/${encodeURIComponent(slug)}`);
  if (!data?.result) return null;

  const { result } = data;
  return {
    slug: result.name,
    label: result.label,
    iconUrl: result.links?.icon ?? null,
    htmlUrl: result.links?.html ?? null,
    releasePolicyUrl: result.links?.releasePolicy ?? null,
    cpe: result.identifiers?.find((i) => i.type === 'cpe')?.id ?? null,
    trains: (result.releases ?? []).map((r) => ({
      train: r.name,
      releaseDate: r.releaseDate,
      isLts: Boolean(r.isLts),
      isMaintained: Boolean(r.isMaintained),
      supportEndDate: r.eoasFrom,
      isSupportEnded: Boolean(r.isEoas),
      eolDate: r.eolFrom,
      isEol: Boolean(r.isEol),
      latestVersion: r.latest?.name ?? null,
      latestDate: r.latest?.date ?? null,
      notesUrl: r.latest?.link ?? null,
    })),
  };
}
