import { useEffect, useState } from 'react';
import type { Snapshot } from './types';

type State =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: Snapshot }
  | { status: 'error'; message: string };

export function useSnapshot(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    // 캐시 무효화 — 매일 새 데이터가 같은 URL로 올라오므로 빌드 시각을 붙인다
    const url = `${import.meta.env.BASE_URL}data/releases.json`;

    fetch(url, { signal: controller.signal, cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`Snapshot request failed (HTTP ${res.status})`);
        return res.json() as Promise<Snapshot>;
      })
      .then((snapshot) => setState({ status: 'ready', snapshot }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });

    return () => controller.abort();
  }, []);

  return state;
}
