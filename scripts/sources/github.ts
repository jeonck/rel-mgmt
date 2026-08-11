import { fetchJson } from '../lib/http.js';
import { compareVersionDesc, parseVersion } from '../lib/semver.js';

interface GhRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

interface GhTag {
  name: string;
  commit: { sha: string; url: string };
}

interface GhCommit {
  commit?: { committer?: { date?: string }; author?: { date?: string } };
}

export interface GhReleaseInfo {
  version: string;
  tag: string;
  prerelease: boolean;
  publishedAt: string | null;
  notesUrl: string;
}

/** 태그 API로 넘어갈 때 커밋 날짜까지 확인할 태그 수 (트레인 중복 제거 후) */
const TAG_DATE_LOOKUPS = 8;

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 기본 태그 필터. 저장소에는 `ent-changelog-1.11.8`, `sdk/v0.19.0` 같은 부속 태그가
 * 섞여 있어서, 버전으로 시작하는 태그만 릴리즈로 인정한다.
 */
const DEFAULT_TAG_FILTER = /^v?\d+\.\d+/;

/**
 * 태그에서 버전 문자열을 뽑는다.
 *
 * `tagFilter`에 캡처 그룹이 있으면 그룹 1이 버전이 된다. 프로젝트마다 태그 앞뒤에 붙이는
 * 장식이 제각각이라(`release-3.95.0-07`, `tauri-v2.11.5`, `rel/15.1.0`) 전역 규칙으로
 * 접두어를 추측하는 대신 제품별로 명시하게 했다 — 예전에 접두어를 공격적으로 잘랐다가
 * MinIO의 `RELEASE.2026-…` 태그가 엉뚱하게 잘린 적이 있다.
 */
function extractVersion(tag: string, re: RegExp): string | null {
  const m = re.exec(tag);
  if (!m) return null;
  return m[1] ?? tag;
}

function toInfo(tag: string, version: string, prerelease: boolean, publishedAt: string | null, notesUrl: string): GhReleaseInfo {
  const parsed = parseVersion(version);
  return {
    version: parsed.version,
    tag,
    // GitHub 플래그와 태그 문자열 둘 다 본다 (플래그를 안 세우는 프로젝트가 많다)
    prerelease: prerelease || parsed.prerelease,
    publishedAt,
    notesUrl,
  };
}

/**
 * 최근 릴리즈 목록을 최신순으로 반환한다.
 * draft는 버리고, prerelease는 플래그를 유지한 채 넘긴다 (판정 규칙이 처리).
 */
export async function fetchGithubReleases(
  repo: string,
  tagFilter?: string,
): Promise<GhReleaseInfo[]> {
  const data = await fetchJson<GhRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=50`,
    { headers: authHeaders() },
  );
  if (!Array.isArray(data)) return [];

  const re = tagFilter ? new RegExp(tagFilter) : DEFAULT_TAG_FILTER;
  const out: GhReleaseInfo[] = [];

  for (const r of data) {
    if (r.draft) continue;
    const version = extractVersion(r.tag_name, re);
    if (version === null) continue;
    out.push(toInfo(r.tag_name, version, r.prerelease, r.published_at, r.html_url));
  }
  return out;
}

/**
 * Releases를 쓰지 않는 저장소(Ceph)나 Releases가 방치된 저장소(Flutter)를 위한 태그 기반 조회.
 *
 * 태그에는 날짜가 없어서 커밋을 한 번 더 봐야 한다. 트레인별로 추린 뒤 상위 몇 개만
 * 조회해 API 호출을 억제한다. 날짜를 못 얻으면 null로 두고, 판정 규칙이
 * "릴리즈 일자 미상"으로 감점 처리한다.
 */
export async function fetchGithubTags(repo: string, tagFilter?: string): Promise<GhReleaseInfo[]> {
  const data = await fetchJson<GhTag[]>(`https://api.github.com/repos/${repo}/tags?per_page=100`, {
    headers: authHeaders(),
  });
  if (!Array.isArray(data)) return [];

  const re = tagFilter ? new RegExp(tagFilter) : DEFAULT_TAG_FILTER;

  const parsed: { info: GhReleaseInfo; sha: string }[] = [];
  for (const t of data) {
    const version = extractVersion(t.name, re);
    if (version === null) continue;
    parsed.push({
      info: toInfo(t.name, version, false, null, `https://github.com/${repo}/releases/tag/${t.name}`),
      sha: t.commit.sha,
    });
  }

  // 트레인당 가장 높은 버전만 남기고, 그중 상위 몇 개만 날짜를 확인한다
  const byTrain = new Map<string, { info: GhReleaseInfo; sha: string }>();
  for (const p of parsed) {
    if (p.info.prerelease) continue;
    const key = parseVersion(p.info.version).train ?? p.info.version;
    const current = byTrain.get(key);
    if (!current || compareVersionDesc(p.info.version, current.info.version) < 0) byTrain.set(key, p);
  }

  const top = [...byTrain.values()]
    .sort((a, b) => compareVersionDesc(a.info.version, b.info.version))
    .slice(0, TAG_DATE_LOOKUPS);

  for (const entry of top) {
    try {
      const commit = await fetchJson<GhCommit>(
        `https://api.github.com/repos/${repo}/commits/${entry.sha}`,
        { headers: authHeaders(), retries: 1 },
      );
      entry.info.publishedAt =
        commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null;
    } catch {
      // 날짜는 있으면 좋고 없으면 감점 사유가 된다 — 여기서 수집을 실패시키지는 않는다
    }
  }

  return top.map((t) => t.info);
}
