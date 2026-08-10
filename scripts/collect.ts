import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, type CatalogEntry } from './catalog.js';
import { fetchEndOfLife, type EolProduct } from './sources/endoflife.js';
import { fetchGithubReleases, type GhReleaseInfo } from './sources/github.js';
import { fetchText, mapLimit } from './lib/http.js';
import { compareVersionDesc, daysBetween, parseVersion } from './lib/semver.js';
import { evaluate, resolvePolicy } from './verdict.js';
import {
  SCHEMA_VERSION,
  type ChangeEvent,
  type EventLog,
  type Product,
  type ReleaseCandidate,
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
const DRY_RUN = process.argv.includes('--dry-run');

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

function toReleaseCandidate(raw: RawCandidate, policyOverride?: CatalogEntry['policy']) {
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
      hasData: true,
    },
    resolvePolicy(policyOverride),
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
      if (!eol) errors.push(`endoflife.date에 '${entry.eol}' 제품이 없습니다`);
    } catch (err) {
      errors.push(`endoflife.date 수집 실패: ${(err as Error).message}`);
    }
  }
  if (entry.repo) {
    try {
      releases = await fetchGithubReleases(entry.repo, entry.tagFilter);
    } catch (err) {
      errors.push(`GitHub 수집 실패: ${(err as Error).message}`);
    }
  }

  const merged = mergeCandidates(eol ? fromEndOfLife(eol) : [], fromGithub(releases));

  const stable = merged.filter((c) => !c.prerelease);
  const pool = (stable.length > 0 ? stable : merged).sort(betterFirst).slice(0, MAX_TRAINS);

  const candidates = pool.map((raw) => toReleaseCandidate(raw, entry.policy));

  const latest = candidates[0] ?? null;
  const recommended = candidates.find((c) => c.verdict === 'GO') ?? null;

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
      if (previous) push(p, 'new-product', `추적 대상에 추가됨`);
      continue;
    }

    if (p.latest && prev.latest && p.latest.version !== prev.latest.version) {
      push(p, 'new-version', `최신 버전 ${prev.latest.version} → ${p.latest.version}`, prev.latest.version, p.latest.version);
    }

    if (p.verdict !== prev.verdict) {
      const rank = { 'NO-GO': 0, UNKNOWN: 1, HOLD: 2, GO: 3 } as const;
      const up = rank[p.verdict] > rank[prev.verdict];
      push(p, up ? 'verdict-up' : 'verdict-down', `판정 ${prev.verdict} → ${p.verdict}`, prev.verdict, p.verdict);
    }

    const before = prev.recommended?.eolInDays ?? prev.latest?.eolInDays ?? null;
    const after = p.recommended?.eolInDays ?? p.latest?.eolInDays ?? null;
    if (before !== null && after !== null && before > 90 && after <= 90) {
      push(p, 'eol-soon', `EOL ${after}일 남음 — 업그레이드 계획 필요`);
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

async function main() {
  console.log(`[collect] ${CATALOG.length}개 제품 수집 시작 (dry-run=${DRY_RUN})`);

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(ICON_DIR, { recursive: true });

  const previous = await readJson<Snapshot>(SNAPSHOT_PATH);
  const prevById = new Map(previous?.products.map((p) => [p.id, p]) ?? []);

  const products = await mapLimit(CATALOG, 6, async (entry) => {
    try {
      const product = await collectProduct(entry);
      // 이번 회차에서 아무 버전도 못 얻었다면 직전 스냅샷을 유지한다 (일시 장애 방어)
      if (!product.latest) {
        const prev = prevById.get(entry.id);
        if (prev?.latest) {
          console.warn(`[collect] ${entry.id}: 수집 실패 — 직전 데이터 유지`);
          return { ...prev, errors: [...product.errors, '이번 수집 실패 — 직전 데이터 표시 중'] };
        }
      }
      console.log(
        `[collect] ${entry.id.padEnd(18)} ${(product.latest?.version ?? '-').padEnd(14)} ${product.verdict}`,
      );
      return product;
    } catch (err) {
      console.error(`[collect] ${entry.id} 실패: ${(err as Error).message}`);
      const prev = prevById.get(entry.id);
      if (prev) return { ...prev, errors: [`수집 실패: ${(err as Error).message}`] };
      throw err;
    }
  });

  const changes = diff(previous, products);

  const counts = {
    total: products.length,
    go: products.filter((p) => p.verdict === 'GO').length,
    hold: products.filter((p) => p.verdict === 'HOLD').length,
    nogo: products.filter((p) => p.verdict === 'NO-GO').length,
    unknown: products.filter((p) => p.verdict === 'UNKNOWN').length,
    eolSoon: products.filter((p) => {
      const d = p.recommended?.eolInDays ?? p.latest?.eolInDays;
      return d !== null && d !== undefined && d <= 180;
    }).length,
    errored: products.filter((p) => p.errors.length > 0).length,
  };

  const snapshot: Snapshot = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: NOW,
    timezone: TIMEZONE,
    counts,
    changes,
    products: products.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
  };

  const prevEvents = (await readJson<EventLog>(EVENTS_PATH))?.events ?? [];
  const eventLog: EventLog = {
    updatedAt: NOW,
    events: [...changes, ...prevEvents].slice(0, EVENT_LOG_LIMIT),
  };

  console.log(
    `[collect] 완료 — GO ${counts.go} / HOLD ${counts.hold} / NO-GO ${counts.nogo} / UNKNOWN ${counts.unknown}, 변경 ${changes.length}건, 오류 ${counts.errored}건`,
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
