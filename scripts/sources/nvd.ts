import { fetchJson } from '../lib/http.js';
import { compareVersions, parseVersion } from '../lib/semver.js';
import type { CveRef, CveSeverity, SecurityReport } from '../../src/lib/types.js';

const ENDPOINT = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const PAGE_SIZE = 200;

/**
 * NVD 레이트리밋: API 키 없이 30초당 5건, 키가 있으면 30초당 50건.
 * 여유를 두고 간격을 잡는다. 키는 https://nvd.nist.gov/developers/request-an-api-key 에서 무료 발급.
 */
const MIN_INTERVAL_MS = process.env.NVD_API_KEY ? 800 : 6_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 전역 직렬 큐. collect.ts가 제품 6개를 동시에 처리하기 때문에
 * 요청 간격은 워커별이 아니라 프로세스 전체에서 지켜져야 한다.
 */
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

interface NvdCvssData {
  baseScore?: number;
  baseSeverity?: string;
}

interface NvdCpeMatch {
  criteria?: string;
  /** false면 "이 CVE가 성립하는 환경"일 뿐 취약한 대상이 아니다 */
  vulnerable?: boolean;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}

interface NvdConfiguration {
  nodes?: { negate?: boolean; cpeMatch?: NvdCpeMatch[] }[];
}

interface NvdCve {
  id: string;
  published?: string;
  vulnStatus?: string;
  configurations?: NvdConfiguration[];
  descriptions?: { lang: string; value: string }[];
  metrics?: {
    cvssMetricV40?: { cvssData?: NvdCvssData }[];
    cvssMetricV31?: { cvssData?: NvdCvssData }[];
    cvssMetricV30?: { cvssData?: NvdCvssData }[];
    cvssMetricV2?: { cvssData?: NvdCvssData; baseSeverity?: string }[];
  };
}

interface NvdResponse {
  totalResults?: number;
  vulnerabilities?: { cve: NvdCve }[];
}

const SEVERITY_RANK: Record<CveSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  UNSCORED: 4,
};

function emptyCounts(): SecurityReport['counts'] {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNSCORED: 0, total: 0 };
}

/** CVSS는 4.0 → 3.1 → 3.0 → 2.0 순으로 가장 최신 지표를 채택한다. */
function scoreOf(cve: NvdCve): { score: number | null; severity: CveSeverity } {
  const m = cve.metrics;
  const candidate =
    m?.cvssMetricV40?.[0]?.cvssData ??
    m?.cvssMetricV31?.[0]?.cvssData ??
    m?.cvssMetricV30?.[0]?.cvssData ??
    m?.cvssMetricV2?.[0]?.cvssData;

  if (!candidate || typeof candidate.baseScore !== 'number') {
    return { score: null, severity: 'UNSCORED' };
  }

  const raw = (candidate.baseSeverity ?? '').toUpperCase();
  if (raw === 'CRITICAL' || raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW') {
    return { score: candidate.baseScore, severity: raw };
  }

  // CVSS v2에는 CRITICAL 등급이 없다 — 점수로 직접 나눈다
  const s = candidate.baseScore;
  return {
    score: s,
    severity: s >= 9 ? 'CRITICAL' : s >= 7 ? 'HIGH' : s >= 4 ? 'MEDIUM' : 'LOW',
  };
}

/**
 * `202107-1` 같은 캘린더 버전인지 판정한다.
 *
 * 일부 제품군은 CLI와 상용 배포판이 같은 CPE를 공유하면서 버전 체계만 다르다
 * (Terraform 1.15.x ↔ Terraform Enterprise 202107-1). NVD 범위를 그대로 비교하면
 * `1.15.8 < 202107-1`이 참이 되어 Enterprise 전용 CVE가 CLI에 붙는다.
 * 두 버전의 체계가 다르면 애초에 비교 대상이 아니라고 본다.
 */
function isCalendarVersion(v: string): boolean {
  const major = parseVersion(v).major;
  return major !== null && major >= 190_000;
}

/** cpeMatch 하나가 실제로 이 버전을 포함하는지 판정한다. */
function matchIncludesVersion(m: NvdCpeMatch, version: string): boolean {
  const declared = m.criteria?.split(':')[5];
  const calendar = isCalendarVersion(version);
  /** 버전 체계가 다르면 비교 자체가 성립하지 않는다 */
  const comparable = (other: string) => isCalendarVersion(other) === calendar;

  // criteria에 구체적 버전이 박혀 있으면 그것과 같아야 한다
  if (declared && declared !== '*' && declared !== '-') {
    return comparable(declared) && compareVersions(version, declared) === 0;
  }

  const { versionStartIncluding: gte, versionStartExcluding: gt } = m;
  const { versionEndIncluding: lte, versionEndExcluding: lt } = m;

  for (const bound of [gte, gt, lte, lt]) {
    if (bound && !comparable(bound)) return false;
  }

  if (gte && compareVersions(version, gte) < 0) return false;
  if (gt && compareVersions(version, gt) <= 0) return false;
  if (lte && compareVersions(version, lte) > 0) return false;
  if (lt && compareVersions(version, lt) >= 0) return false;

  // 범위 제한이 하나도 없으면 해당 제품의 모든 버전이 대상이다
  return true;
}

/**
 * NVD가 돌려준 CVE가 정말 이 제품·이 버전을 "취약한 대상"으로 지목하는지 확인한다.
 *
 * NVD의 virtualMatchString은 CVE 설정 트리에 그 CPE가 등장하기만 하면 매칭한다.
 * 그런데 설정 트리에는 `vulnerable: false`인 항목 — 즉 "이 위에서 돌아갈 때 성립한다"는
 * 실행 환경 표기 — 도 함께 들어 있다. 이걸 거르지 않으면 Django CVE가 Python에,
 * Next.js CVE가 Node.js에, Terraform Enterprise CVE가 Terraform에 붙어버린다.
 * 실제로 처음 수집했을 때 그렇게 나왔고, 그 오탐만으로 판정이 뒤집혔다.
 */
function affectsProduct(cve: NvdCve, cpeBase: string, version: string): boolean {
  const prefix = `${cpeBase}:`;

  for (const config of cve.configurations ?? []) {
    for (const node of config.nodes ?? []) {
      if (node.negate) continue;
      for (const m of node.cpeMatch ?? []) {
        if (!m.vulnerable) continue;
        if (!m.criteria?.startsWith(prefix)) continue;
        if (matchIncludesVersion(m, version)) return true;
      }
    }
  }
  return false;
}

/**
 * CPE 문자열을 `cpe:2.3:<part>:<vendor>:<product>` 형태로 정규화한다.
 *
 * endoflife.date는 두 포맷을 섞어서 준다 — 대부분은 2.3 포맷이지만
 * 일부(예: Jenkins)는 구형 2.2 URI(`cpe:/a:jenkins:jenkins`)로 들어온다.
 * NVD API는 2.3 포맷만 받는다.
 */
export function normalizeCpeBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  if (s.startsWith('cpe:2.3:')) {
    const parts = s.split(':');
    return parts.length >= 5 ? parts.slice(0, 5).join(':') : null;
  }

  if (s.startsWith('cpe:/')) {
    const parts = s.slice('cpe:/'.length).split(':');
    return parts.length >= 3 ? ['cpe', '2.3', parts[0], parts[1], parts[2]].join(':') : null;
  }

  return null;
}

/**
 * 특정 버전에 영향을 주는 CVE를 NVD에서 조회한다.
 *
 * 버전 범위 매칭은 NVD가 직접 수행한다(`virtualMatchString`). 우리가 CPE 설정 트리를
 * 해석하지 않으므로, 범위 해석 버그로 취약점을 놓칠 여지가 없다.
 *
 * 주의: NVD의 CPE 데이터는 신규 릴리즈에 대해 수 주 늦는다.
 * "0건"은 "안전함"이 아니라 "아직 등록된 항목이 없음"으로 읽어야 한다.
 */
export async function fetchCves(cpeBase: string, version: string): Promise<SecurityReport> {
  const checkedAt = new Date().toISOString();

  // cpe:2.3:a:vendor:product 형태에 버전을 끼우고 나머지 필드를 와일드카드로 채운다.
  // NVD는 13개 필드를 모두 갖춘 CPE만 매칭한다.
  const base = normalizeCpeBase(cpeBase);
  if (!base) {
    return { status: 'unmapped', counts: emptyCounts(), top: [], cpe: cpeBase, checkedAt: null };
  }
  const cpe = [base, version, ...Array(7).fill('*')].join(':');

  const url =
    `${ENDPOINT}?virtualMatchString=${encodeURIComponent(cpe)}&resultsPerPage=${PAGE_SIZE}`;

  try {
    const data = await throttled(() =>
      fetchJson<NvdResponse>(url, {
        headers: process.env.NVD_API_KEY ? { apiKey: process.env.NVD_API_KEY } : {},
        timeoutMs: 40_000,
        retries: 2,
      }),
    );

    if (!data) {
      return {
        status: 'error',
        counts: emptyCounts(),
        top: [],
        cpe,
        checkedAt,
        note: 'NVD returned no data for this CPE',
      };
    }

    const counts = emptyCounts();
    const refs: CveRef[] = [];
    let filtered = 0;

    for (const entry of data.vulnerabilities ?? []) {
      const cve = entry.cve;
      // 철회된 항목은 취약점이 아니다
      if (cve.vulnStatus === 'Rejected') continue;
      // 실행 환경으로만 언급된 CVE는 이 제품의 취약점이 아니다
      if (!affectsProduct(cve, base, version)) {
        filtered++;
        continue;
      }

      const { score, severity } = scoreOf(cve);
      counts[severity] += 1;
      counts.total += 1;

      refs.push({
        id: cve.id,
        score,
        severity,
        published: cve.published ?? null,
        summary:
          cve.descriptions?.find((d) => d.lang === 'en')?.value?.replace(/\s+/g, ' ').trim() ?? '',
        url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      });
    }

    refs.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.score ?? 0) - (a.score ?? 0),
    );

    const truncated = (data.totalResults ?? 0) > PAGE_SIZE;
    const notes = [
      truncated ? `NVD returned more than ${PAGE_SIZE} records; only the first page was read` : null,
      filtered > 0
        ? `${filtered} record${filtered === 1 ? '' : 's'} excluded — the product appeared only as a runtime platform, not as the vulnerable component`
        : null,
    ].filter(Boolean);

    return {
      status: 'ok',
      counts,
      top: refs.slice(0, 6),
      cpe,
      checkedAt,
      note: notes.length > 0 ? notes.join('. ') : undefined,
    };
  } catch (err) {
    return {
      status: 'error',
      counts: emptyCounts(),
      top: [],
      cpe,
      checkedAt,
      note: `NVD lookup failed: ${(err as Error).message}`,
    };
  }
}

export function unmappedReport(): SecurityReport {
  return { status: 'unmapped', counts: emptyCounts(), top: [], cpe: null, checkedAt: null };
}

export function skippedReport(): SecurityReport {
  return { status: 'skipped', counts: emptyCounts(), top: [], cpe: null, checkedAt: null };
}
