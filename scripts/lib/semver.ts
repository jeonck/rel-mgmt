/** 릴리즈 태그를 다루기 위한 아주 얇은 버전 유틸. semver 패키지를 쓰지 않는다. */

/**
 * 프리릴리즈 판별. 구분자 없이 붙는 형태(`2.21.3rc1`)와 붙임표 형태(`3.5.0-rc3`, `4.1.0-RC1`)를
 * 모두 잡아야 해서 패턴이 여러 갈래다.
 */
const PRERELEASE_RE =
  /(?:alpha|beta|preview|snapshot|nightly|canary|unstable)|(?:[-._]?rc[-._]?\d)|(?:[-._](?:pre|dev|ea|next)\b)|(?:[-._]m\d+$)/i;

export interface ParsedVersion {
  /** 표시용 정규화 문자열 (접두어 제거) */
  version: string;
  major: number | null;
  minor: number | null;
  patch: number | null;
  /** major.minor — 릴리즈 트레인 */
  train: string | null;
  prerelease: boolean;
}

/**
 * `v1.36.3`, `release-1.29.0`, `1.36`, `RELEASE.2026-01-02T...` 등을 관대하게 파싱한다.
 * 숫자 트리플을 못 찾으면 train/patch는 null이고 verdict 규칙이 알아서 완화된다.
 */
export function parseVersion(raw: string): ParsedVersion {
  const trimmed = raw.trim();
  const prerelease = PRERELEASE_RE.test(trimmed);

  // `v` 접두어만 벗긴다. 이보다 공격적으로 자르면 `RELEASE.2026-12-18T…` 같은
  // 날짜 기반 태그가 엉뚱하게 잘려나간다 — 그런 태그는 원문 그대로 보존한다.
  const cleaned = trimmed.replace(/^v(?=\d)/i, '');

  const m = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) {
    return { version: cleaned || trimmed, major: null, minor: null, patch: null, train: null, prerelease };
  }

  const major = Number(m[1]);
  const minor = m[2] === undefined ? null : Number(m[2]);
  const patch = m[3] === undefined ? null : Number(m[3]);

  return {
    version: cleaned,
    major,
    minor,
    patch,
    train: minor === null ? String(major) : `${major}.${minor}`,
    prerelease,
  };
}

/**
 * 오름차순 비교 (-1 / 0 / 1). 버전 범위 판정에 쓴다.
 * 누락된 자리는 0으로 본다 — `3.14`는 `3.14.0`과 같게 취급한다.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const segments: [number | null, number | null][] = [
    [pa.major, pb.major],
    [pa.minor, pb.minor],
    [pa.patch, pb.patch],
  ];
  for (const [x, y] of segments) {
    const dx = x ?? 0;
    const dy = y ?? 0;
    if (dx !== dy) return dx < dy ? -1 : 1;
  }
  // 26.8.0.126808 처럼 자릿수가 더 있는 경우를 위한 마무리 비교
  return Math.sign(pa.version.localeCompare(pb.version, 'en', { numeric: true }));
}

/** 큰 버전이 앞에 오도록 비교 (내림차순 정렬용). */
export function compareVersionDesc(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const parts: Array<[number | null, number | null]> = [
    [pb.major, pa.major],
    [pb.minor, pa.minor],
    [pb.patch, pa.patch],
  ];
  for (const [x, y] of parts) {
    const dx = x ?? -1;
    const dy = y ?? -1;
    if (dx !== dy) return dx - dy;
  }
  return b.localeCompare(a, 'en', { numeric: true });
}

/** ISO 날짜 문자열 사이의 일 수. 잘못된 입력이면 null. */
export function daysBetween(fromIso: string | null | undefined, toIso: string): number | null {
  if (!fromIso) return null;
  const from = Date.parse(fromIso.length === 10 ? `${fromIso}T00:00:00Z` : fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}
