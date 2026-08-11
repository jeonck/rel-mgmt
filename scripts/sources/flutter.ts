import { fetchJson } from '../lib/http.js';
import { compareVersionDesc } from '../lib/semver.js';
import type { GhReleaseInfo } from './github.js';

/**
 * Flutter 전용 릴리즈 소스.
 *
 * Flutter는 GitHub Releases를 사실상 방치했고(최신 항목이 2024년 프리릴리즈에 멈춰 있다),
 * 태그는 수천 개인 데다 API가 정렬을 보장하지 않아 첫 페이지에 2020년 1.x 태그가 나온다.
 * 둘 중 무엇을 써도 "최신 버전"을 2년 묵은 값으로 표시하게 되므로 공식 릴리즈 매니페스트를 쓴다.
 */
const MANIFEST = 'https://storage.googleapis.com/flutter_infra_release/releases/releases_linux.json';

interface FlutterManifest {
  releases?: { version: string; channel: string; release_date?: string; hash?: string }[];
}

export async function fetchFlutterReleases(): Promise<GhReleaseInfo[]> {
  const data = await fetchJson<FlutterManifest>(MANIFEST, { timeoutMs: 30_000 });
  if (!data?.releases) return [];

  const stable = data.releases.filter((r) => r.channel === 'stable' && r.version);

  return stable
    .map((r) => ({
      version: r.version.replace(/^v/, ''),
      tag: r.version,
      prerelease: false,
      publishedAt: r.release_date ?? null,
      notesUrl: `https://docs.flutter.dev/release/release-notes/release-notes-${r.version}`,
    }))
    .sort((a, b) => compareVersionDesc(a.version, b.version))
    .slice(0, 30);
}
