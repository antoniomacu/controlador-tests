import { useEffect, useState } from 'preact/hooks';

/** Re-renders every `intervalMs` with the current time from `now`. */
export function useNow(now: () => number, intervalMs = 1000): number {
  const [value, setValue] = useState(now);
  useEffect(() => {
    setValue(now());
    const id = setInterval(() => setValue(now()), intervalMs);
    return () => clearInterval(id);
  }, [now, intervalMs]);
  return value;
}
