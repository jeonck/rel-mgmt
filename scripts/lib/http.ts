/** 재시도 + 타임아웃이 붙은 최소한의 JSON fetch 래퍼. */

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** 404를 오류가 아니라 null로 취급 */
  allow404?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T | null> {
  const { headers = {}, timeoutMs = 20_000, retries = 3, allow404 = true } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'rel-mgmt-collector/1.0', accept: 'application/json', ...headers },
        signal: controller.signal,
      });

      if (res.status === 404) {
        if (allow404) return null;
        throw new Error(`404 Not Found: ${url}`);
      }

      // 레이트리밋/일시 장애는 재시도 대상
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        const reset = res.headers.get('x-ratelimit-reset');
        throw new Error(
          `HTTP ${res.status}${reset ? ` (ratelimit reset ${reset})` : ''}: ${url}`,
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 텍스트(SVG 등) 다운로드. 실패하면 null. */
export async function fetchText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'rel-mgmt-collector/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 동시 실행 수를 제한한 map. 외부 API를 예의 있게 두드리기 위한 장치. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}
