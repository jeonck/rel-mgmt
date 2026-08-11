import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, type CatalogEntry } from './catalog.js';
import { fetchEndOfLife, type EolProduct } from './sources/endoflife.js';
import { fetchGithubReleases, fetchGithubTags, type GhReleaseInfo } from './sources/github.js';
import { fetchFlutterReleases } from './sources/flutter.js';
import { fetchCves, skippedReport, unmappedReport } from './sources/nvd.js';
import { fetchText, mapLimit } from './lib/http.js';
import { compareVersionDesc, daysBetween, parseVersion } from './lib/semver.js';
import { evaluate, resolvePolicy } from './verdict.js';
import {
  SCHEMA_VERSION,
  type ChangeEvent,
  type EventLog,
  type Product,
  type ReleaseCandidate,
  type SecurityReport,
  type Snapshot,
  type TrainInfo,
} from '../src/lib/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const ICON_DIR = join(ROOT, 'public', 'icons');
const SNAPSHOT_PATH = join(DATA_DIR, 'releases.json');
const EVENTS_PATH = join(DATA_DIR, 'events.json');

const TIMEZONE = 'America/Chicago'; // CDT/CST — 수집 스케줄 기준 시간대
const EVENT_LOG_LIMIT = 400;
const MAX_TRAINS = 6;
/**
 * 제품당 NVD 조회 상한 = 후보 트레인 수 + 최신 1건.
 *
 * 낮게 잡았다가 문제가 있었다. 상한이 3이면 Python처럼 여러 트레인이 같은 CVE에 걸린
 * 제품에서 앞의 후보들이 예산을 다 쓰고, 정작 "권장"으로 뽑히는 버전은 CVE를 한 번도
 * 확인하지 않은 채 안전한 대안처럼 화면에 나간다. 권장 버전만큼은 반드시 검증된
 * 상태여야 하므로 탐색 전체를 덮을 수 있는 예산을 준다.
 */
const MAX_CVE_LOOKUPS = MAX_TRAINS + 1;
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CVE = process.argv.includes('--skip-cve');
/** `--only=kubernetes,nginx` — 부분 수집. 나머지 제품은 직전 스냅샷을 유지한다. */
const ONLY = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .filter(Boolean);

const NOW = new Date().toISOString();

// ─────────────────────────────────────────────────────── 후보 버전 조립

interface RawCandidate {
  version: string;
  train: string | null;
  releaseDate: string | null;
  isLts: boolean;
  isMaintained: boolean;
  eolDate: string | null;
  isEol: boolean;
  supportEndDate: string | null;
  isSupportEnded: boolean;
  notesUrl: string | null;
  prerelease: boolean;
}

function fromEndOfLife(eol: EolProduct): RawCandidate[] {
  return eol.trains.map((t) => {
    const version = t.latestVersion ?? t.train;
    return {
      version,
      train: t.train,
      releaseDate: t.latestDate ?? t.releaseDate,
      isLts: t.isLts,
      isMaintained: t.isMaintained,
      eolDate: t.eolDate,
      isEol: t.isEol,
      supportEndDate: t.supportEndDate,
      isSupportEnded: t.isSupportEnded,
      notesUrl: t.notesUrl,
      prerelease: parseVersion(version).prerelease,
    };
  });
}

/**
 * 후보 정렬 기준 (앞에 올수록 "더 나은" 후보):
 *  1. 안정판이 프리릴리즈보다 항상 우선 — 이걸 빼면 `2.15.2-rc3`가 `2.15.2`를 밀어낸다
 *  2. 버전 내림차순
 *  3. 버전을 숫자로 못 읽는 태그(MinIO의 RELEASE.2026-…)는 릴리즈 일자 내림차순
 */
function betterFirst(a: RawCandidate, b: RawCandidate): number {
  if (a.prerelease !== b.prerelease) return a.prerelease ? 1 : -1;

  const va = parseVersion(a.version);
  const vb = parseVersion(b.version);
  if (va.major === null && vb.major === null) {
    return (Date.parse(b.releaseDate ?? '') || 0) - (Date.parse(a.releaseDate ?? '') || 0);
  }
  return compareVersionDesc(a.version, b.version);
}

function fromGithub(releases: GhReleaseInfo[]): RawCandidate[] {
  const all: RawCandidate[] = releases.map((r) => ({
    version: r.version,
    train: parseVersion(r.version).train,
    releaseDate: r.publishedAt,
    isLts: false,
    isMaintained: true,
    eolDate: null,
    isEol: false,
    supportEndDate: null,
    isSupportEnded: false,
    notesUrl: r.notesUrl,
    prerelease: r.prerelease,
  }));

  // 트레인당 가장 나은 릴리즈 하나만 남긴다
  const byTrain = new Map<string, RawCandidate>();
  for (const c of all) {
    const key = c.train ?? c.version;
    const current = byTrain.get(key);
    if (!current || betterFirst(c, current) < 0) byTrain.set(key, c);
  }
  return [...byTrain.values()];
}

/**
 * endoflife.date를 EOL 기준(진실의 원천)으로 쓰고, GitHub은 릴리즈 노트와
 * 아직 endoflife.date에 반영되지 않은 최신 패치를 보강하는 데 쓴다.
 */
function mergeCandidates(eolCands: RawCandidate[], ghCands: RawCandidate[]): RawCandidate[] {
  if (eolCands.length === 0) return ghCands;

  const byTrain = new Map<string, RawCandidate>();
  for (const c of eolCands) byTrain.set(c.train ?? c.version, c);

  for (const gh of ghCands) {
    const key = gh.train ?? gh.version;
    const base = byTrain.get(key);
    if (!base) {
      // endoflife.date가 아직 모르는 새 트레인 — EOL 정보 없이 추가
      byTrain.set(key, gh);
      continue;
    }
    // 릴리즈 노트 링크는 GitHub 쪽이 항상 더 낫다
    base.notesUrl = gh.notesUrl ?? base.notesUrl;
    // GitHub에 더 나은(= 더 최신 안정판) 릴리즈가 있으면 버전/일자를 끌어올린다.
    // 안정판을 프리릴리즈로 덮어쓰는 일은 없어야 한다.
    if (betterFirst(gh, base) < 0) {
      base.version = gh.version;
      base.releaseDate = gh.releaseDate ?? base.releaseDate;
      base.prerelease = gh.prerelease;
    }
  }
  return [...byTrain.values()];
}

function toReleaseCandidate(raw: RawCandidate, security: SecurityReport, entry: CatalogEntry) {
  const parsed = parseVersion(raw.version);
  const ageDays = daysBetween(raw.releaseDate, NOW);
  // daysBetween(eol, now)은 EOL이 지났으면 양수 → 부호를 뒤집어 "잔여일"로 만든다
  const elapsedSinceEol = daysBetween(raw.eolDate, NOW);
  const eolInDays = elapsedSinceEol === null ? null : -elapsedSinceEol;

  const { verdict, score, reasons } = evaluate(
    {
      patch: parsed.patch,
      ageDays,
      prerelease: raw.prerelease,
      isLts: raw.isLts,
      isEol: raw.isEol || (eolInDays !== null && eolInDays < 0),
      isSupportEnded: raw.isSupportEnded,
      isMaintained: raw.isMaintained,
      eolInDays,
      security,
      cveScoring: entry.cveScoring ?? 'score',
      hasData: true,
    },
    resolvePolicy(entry.policy),
  );

  const candidate: ReleaseCandidate = {
    version: raw.version,
    train: raw.train,
    patch: parsed.patch,
    channel: raw.prerelease ? 'prerelease' : 'stable',
    releaseDate: raw.releaseDate,
    ageDays,
    isLts: raw.isLts,
    eolDate: raw.eolDate,
    eolInDays,
    isEol: raw.isEol || (eolInDays !== null && eolInDays < 0),
    supportEndDate: raw.supportEndDate,
    isSupportEnded: raw.isSupportEnded,
    notesUrl: raw.notesUrl,
    security,
    verdict,
    score,
    reasons,
  };
  return candidate;
}

// ─────────────────────────────────────────────────────── 아이콘

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureIcon(entry: CatalogEntry, eolIconUrl: string | null): Promise<string | null> {
  const target = join(ICON_DIR, `${entry.id}.svg`);
  if (await exists(target)) return entry.id;
  if (DRY_RUN) return null;

  const urls = [
    eolIconUrl,
    entry.icon ? `https://cdn.jsdelivr.net/npm/simple-icons/icons/${entry.icon}.svg` : null,
  ].filter((u): u is string => Boolean(u));

  for (const url of urls) {
    const svg = await fetchText(url);
    // 단색 아이콘만 허용 — 마스크로 렌더하므로 <svg> 한 덩어리면 충분하다
    if (svg && svg.includes('<svg') && svg.length < 40_000) {
      await writeFile(target, svg, 'utf8');
      return entry.id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────── 제품 단위 수집

async function collectProduct(entry: CatalogEntry): Promise<Product> {
  const errors: string[] = [];

  let eol: EolProduct | null = null;
  let releases: GhReleaseInfo[] = [];

  if (entry.eol) {
    try {
      eol = await fetchEndOfLife(entry.eol);
      if (!eol) errors.push(`endoflife.date has no product named "${entry.eol}"`);
    } catch (err) {
      errors.push(`endoflife.date lookup failed: ${(err as Error).message}`);
    }
  }
  if (entry.customSource === 'flutter') {
    try {
      releases = await fetchFlutterReleases();
    } catch (err) {
      errors.push(`Flutter release manifest lookup failed: ${(err as Error).message}`);
    }
  } else if (entry.repo) {
    try {
      releases =
        entry.githubSource === 'tags'
          ? await fetchGithubTags(entry.repo, entry.tagFilter)
          : await fetchGithubReleases(entry.repo, entry.tagFilter);

      // Releases를 아예 발행하지 않는 저장소(Ceph 등)는 태그로 넘어간다
      if (releases.length === 0 && entry.githubSource !== 'tags') {
        releases = await fetchGithubTags(entry.repo, entry.tagFilter);
      }
    } catch (err) {
      errors.push(`GitHub lookup failed: ${(err as Error).message}`);
    }
  }

  const merged = mergeCandidates(eol ? fromEndOfLife(eol) : [], fromGithub(releases));

  const stable = merged.filter((c) => !c.prerelease);
  const pool = (stable.length > 0 ? stable : merged).sort(betterFirst).slice(0, MAX_TRAINS);

  // ── 판정 1차: CVE 없이 평가한다.
  // CVE 조회는 비싸므로(NVD 레이트리밋) 화면에 실제로 나가는 후보에만 쓴다.
  const candidates = pool.map((raw) => toReleaseCandidate(raw, skippedReport(), entry));

  const cpe = entry.cveTracking === 'none' ? null : (entry.cpe ?? eol?.cpe ?? null);
  let lookups = 0;

  /** 후보 i에 CVE를 반영해 다시 평가한다. 이미 조회했거나 예산을 넘었으면 그대로 둔다. */
  const applyCves = async (i: number): Promise<void> => {
    const raw = pool[i];
    const current = candidates[i];
    if (!raw || !current || current.security.status !== 'skipped') return;

    if (!cpe) {
      candidates[i] = toReleaseCandidate(raw, unmappedReport(), entry);
      return;
    }
    if (SKIP_CVE || lookups >= MAX_CVE_LOOKUPS) return;

    lookups++;
    const report = await fetchCves(cpe, raw.version);
    if (report.status === 'error') errors.push(report.note ?? 'NVD lookup failed');
    candidates[i] = toReleaseCandidate(raw, report, entry);
  };

  // 최신 버전은 헤드라인 판정이라 항상 조회한다
  await applyCves(0);

  // 권장 버전은 "CVE까지 반영하고도 GO"인 첫 후보다.
  // 1차에서 GO였던 후보만 확인하면 되므로 대개 1~2회 추가 조회로 끝난다.
  //
  // 검증되지 않은(status === 'skipped') 후보는 절대 권장하지 않는다 —
  // 확인 안 한 버전을 "안전한 대안"이라고 내놓는 게 가장 나쁜 실패 방식이다.
  let recommended: ReleaseCandidate | null = null;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i]!.verdict !== 'GO') continue;
    await applyCves(i);
    const candidate = candidates[i]!;
    if (candidate.verdict === 'GO' && candidate.security.status !== 'skipped') {
      recommended = candidate;
      break;
    }
  }

  const latest = candidates[0] ?? null;

  const trains: TrainInfo[] = pool.map((raw, i) => ({
    train: raw.train ?? raw.version,
    latest: raw.version,
    releaseDate: raw.releaseDate,
    eolDate: raw.eolDate,
    eolInDays: candidates[i]!.eolInDays,
    isEol: candidates[i]!.isEol,
    isLts: raw.isLts,
    isMaintained: raw.isMaintained,
  }));

  const iconId = await ensureIcon(entry, eol?.iconUrl ?? null).catch(() => null);

  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    vendor: entry.vendor,
    blurb: entry.blurb,
    homepage: entry.homepage,
    iconId,
    // 헤드라인 판정은 "최신 버전을 지금 올려도 되는가"에 답한다.
    // 최신이 GO가 아닐 때 대안은 recommended(도입 가능한 최신 버전)로 따로 보여준다.
    verdict: latest?.verdict ?? 'UNKNOWN',
    latest,
    recommended,
    trains,
    sources: {
      github: entry.repo ? `https://github.com/${entry.repo}/releases` : undefined,
      endoflife: eol?.htmlUrl ?? undefined,
      releasePolicy: eol?.releasePolicyUrl ?? undefined,
    },
    errors,
    collectedAt: NOW,
  };
}

// ─────────────────────────────────────────────────────── 변경 감지

function diff(previous: Snapshot | null, products: Product[]): ChangeEvent[] {
  const prevById = new Map(previous?.products.map((p) => [p.id, p]) ?? []);
  const events: ChangeEvent[] = [];

  const push = (p: Product, kind: ChangeEvent['kind'], message: string, from?: string, to?: string) =>
    events.push({ at: NOW, productId: p.id, productName: p.name, category: p.category, kind, message, from, to });

  for (const p of products) {
    const prev = prevById.get(p.id);

    if (!prev) {
      if (previous) push(p, 'new-product', 'Added to the tracked catalog');
      continue;
    }

    if (p.latest && prev.latest && p.latest.version !== prev.latest.version) {
      push(
        p,
        'new-version',
        `Latest ${prev.latest.version} → ${p.latest.version}`,
        prev.latest.version,
        p.latest.version,
      );
    }

    if (p.verdict !== prev.verdict) {
      const rank = { 'NO-GO': 0, UNKNOWN: 1, HOLD: 2, GO: 3 } as const;
      const up = rank[p.verdict] > rank[prev.verdict];
      push(
        p,
        up ? 'verdict-up' : 'verdict-down',
        `Verdict ${prev.verdict} → ${p.verdict}`,
        prev.verdict,
        p.verdict,
      );
    }

    // 새로 등재된 CVE는 버전이 그대로여도 알려야 한다 — NVD 등재가 릴리즈보다 늦기 때문이다
    const prevCve = prev.latest?.security;
    const nowCve = p.latest?.security;
    if (
      prevCve?.status === 'ok' &&
      nowCve?.status === 'ok' &&
      nowCve.counts.total > prevCve.counts.total
    ) {
      const added = nowCve.counts.total - prevCve.counts.total;
      push(
        p,
        'new-cve',
        `${added} new CVE${added === 1 ? '' : 's'} recorded against ${p.latest?.version}`,
      );
    }

    const before = prev.recommended?.eolInDays ?? prev.latest?.eolInDays ?? null;
    const after = p.recommended?.eolInDays ?? p.latest?.eolInDays ?? null;
    if (before !== null && after !== null && before > 90 && after <= 90) {
      push(p, 'eol-soon', `${after} days of support left — plan the upgrade`);
    }
  }

  return events;
}

// ─────────────────────────────────────────────────────── main

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * `--only` 실행이 조용히 데이터를 되돌리는 것을 막는 경고.
 *
 * 부분 수집도 결과물은 "전체 스냅샷"이다. 목록에 없는 제품은 로컬 releases.json에서
 * 그대로 복사돼 나가므로, 체크아웃이 뒤처져 있으면 수집하지 않은 제품이 옛 값으로
 * 되돌아간다. 실제로 두 커밋 뒤처진 스냅샷에서 한 제품만 돌렸다가 99종이 80종이 된 적이
 * 있고, 어디에서도 오류가 나지 않았다. 그래서 이월 건수와 스냅샷 나이를 눈에 띄게 찍는다.
 */
function warnAboutPartialRun(
  only: string[],
  collectedNow: Product[],
  merged: Product[],
  previous: Snapshot | null,
): void {
  const unknownIds = only.filter((id) => !CATALOG.some((e) => e.id === id));
  if (unknownIds.length > 0) {
    console.warn(`[collect] ⚠ 카탈로그에 없는 id: ${unknownIds.join(', ')}`);
  }

  const carried = merged.length - collectedNow.length;
  if (carried <= 0) return;

  const ageHours = previous
    ? (Date.parse(NOW) - Date.parse(previous.generatedAt)) / 3_600_000
    : null;
  const age =
    ageHours === null
      ? '기존 스냅샷 없음'
      : ageHours < 1
        ? `${Math.round(ageHours * 60)}분 전 수집분`
        : `${ageHours.toFixed(1)}시간 전 수집분`;

  console.warn(
    `[collect] ⚠ 부분 수집: ${collectedNow.length}종만 새로 수집하고 ${carried}종은 기존 스냅샷(${age})을 그대로 이월합니다.`,
  );

  // 하루가 지난 스냅샷이면 야간 수집이 이미 한 번 이상 돌았다는 뜻이다 —
  // 이월된 값이 원격보다 오래됐을 가능성이 높다.
  if (ageHours !== null && ageHours > 12) {
    console.warn(
      `[collect] ⚠ 이월본이 오래됐습니다. 커밋하면 그 ${carried}종이 옛 값으로 되돌아갑니다. ` +
        `git pull 후 다시 실행하거나, 확인만 할 거라면 --dry-run을 쓰세요.`,
    );
  }
}

async function main() {
  const catalog = ONLY ? CATALOG.filter((e) => ONLY.includes(e.id)) : CATALOG;
  console.log(
    `[collect] ${catalog.length}개 제품 수집 시작 (dry-run=${DRY_RUN}, cve=${SKIP_CVE ? 'skip' : process.env.NVD_API_KEY ? 'api-key' : 'anonymous'})`,
  );

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(ICON_DIR, { recursive: true });

  const previous = await readJson<Snapshot>(SNAPSHOT_PATH);
  const prevById = new Map(previous?.products.map((p) => [p.id, p]) ?? []);

  const products = await mapLimit(catalog, 6, async (entry) => {
    try {
      const product = await collectProduct(entry);
      // 이번 회차에서 아무 버전도 못 얻었다면 직전 스냅샷을 유지한다 (일시 장애 방어)
      if (!product.latest) {
        const prev = prevById.get(entry.id);
        if (prev?.latest) {
          console.warn(`[collect] ${entry.id}: 수집 실패 — 직전 데이터 유지`);
          return {
            ...prev,
            errors: [...product.errors, 'This run failed — showing the previous snapshot'],
          };
        }
      }
      const cve = product.latest?.security;
      const cveNote =
        cve?.status === 'ok' ? `CVE ${cve.counts.total}` : `CVE ${cve?.status ?? 'n/a'}`;
      console.log(
        `[collect] ${entry.id.padEnd(18)} ${(product.latest?.version ?? '-').padEnd(14)} ${product.verdict.padEnd(7)} ${cveNote}`,
      );
      return product;
    } catch (err) {
      console.error(`[collect] ${entry.id} 실패: ${(err as Error).message}`);
      const prev = prevById.get(entry.id);
      if (prev) return { ...prev, errors: [`Collection failed: ${(err as Error).message}`] };
      throw err;
    }
  });

  // `--only`로 일부만 돌렸다면 나머지는 직전 스냅샷을 그대로 살린다.
  // 이게 없으면 부분 재수집이 나머지 제품을 통째로 지워버린다.
  const collected = ONLY
    ? CATALOG.map((entry) => products.find((p) => p.id === entry.id) ?? prevById.get(entry.id)).filter(
        (p): p is Product => Boolean(p),
      )
    : products;

  if (ONLY) warnAboutPartialRun(ONLY, products, collected, previous);

  const changes = diff(previous, collected);

  const counts = {
    total: collected.length,
    go: collected.filter((p) => p.verdict === 'GO').length,
    hold: collected.filter((p) => p.verdict === 'HOLD').length,
    nogo: collected.filter((p) => p.verdict === 'NO-GO').length,
    unknown: collected.filter((p) => p.verdict === 'UNKNOWN').length,
    eolSoon: collected.filter((p) => {
      const d = p.recommended?.eolInDays ?? p.latest?.eolInDays;
      return d !== null && d !== undefined && d <= 180;
    }).length,
    errored: collected.filter((p) => p.errors.length > 0).length,
    cveAffected: collected.filter((p) => (p.latest?.security.counts.total ?? 0) > 0).length,
    cveSevere: collected.filter(
      (p) => (p.latest?.security.counts.CRITICAL ?? 0) + (p.latest?.security.counts.HIGH ?? 0) > 0,
    ).length,
  };

  const snapshot: Snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: NOW,
    timezone: TIMEZONE,
    counts,
    changes,
    products: collected.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  };

  const prevEvents = (await readJson<EventLog>(EVENTS_PATH))?.events ?? [];
  const eventLog: EventLog = {
    updatedAt: NOW,
    events: [...changes, ...prevEvents].slice(0, EVENT_LOG_LIMIT),
  };

  console.log(
    `[collect] 완료 — 총 ${counts.total}종 · GO ${counts.go} / HOLD ${counts.hold} / NO-GO ${counts.nogo} / UNKNOWN ${counts.unknown}, 변경 ${changes.length}건, 오류 ${counts.errored}건`,
  );

  if (DRY_RUN) {
    console.log('[collect] --dry-run: 파일을 쓰지 않고 종료');
    return;
  }

  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(EVENTS_PATH, `${JSON.stringify(eventLog, null, 2)}\n`, 'utf8');
  console.log(`[collect] 저장: ${SNAPSHOT_PATH}`);
}

main().catch((err) => {
  console.error('[collect] 치명적 오류:', err);
  process.exit(1);
});
