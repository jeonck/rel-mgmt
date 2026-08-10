import { fetchJson } from '../lib/http.js';
import { parseVersion } from '../lib/semver.js';

interface GhRelease {
  tag_name: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

export interface GhReleaseInfo {
  version: string;
  tag: string;
  prerelease: boolean;
  publishedAt: string | null;
  notesUrl: string;
}

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 최근 릴리즈 목록을 최신순으로 반환한다.
 * draft는 버리고, prerelease는 플래그를 유지한 채 넘긴다 (판정 규칙이 처리).
 */
/**
 * 기본 태그 필터. 저장소에는 `ent-changelog-1.11.8`, `sdk/v0.19.0` 같은 부속 태그가
 * 섞여 있어서, 버전으로 시작하는 태그만 릴리즈로 인정한다.
 */
const DEFAULT_TAG_FILTER = /^v?\d+\.\d+/;

export async function fetchGithubReleases(
  repo: string,
  tagFilter?: string,
): Promise<GhReleaseInfo[]> {
  const data = await fetchJson<GhRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=30`,
    { headers: authHeaders() },
  );
  if (!Array.isArray(data)) return [];

  const re = tagFilter ? new RegExp(tagFilter) : DEFAULT_TAG_FILTER;

  return data
    .filter((r) => !r.draft)
    .filter((r) => re.test(r.tag_name))
    .map((r) => {
      const parsed = parseVersion(r.tag_name);
      return {
        version: parsed.version,
        tag: r.tag_name,
        // GitHub 플래그와 태그 문자열 둘 다 본다 (플래그를 안 세우는 프로젝트가 많다)
        prerelease: r.prerelease || parsed.prerelease,
        publishedAt: r.published_at,
        notesUrl: r.html_url,
      };
    });
}
