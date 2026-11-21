interface RateLimitState {
  sources: Map<string, number[]>;
  global: number[];
}

type RateLimitHolder = typeof globalThis & {
  __dinotalkRateLimits?: Map<string, RateLimitState>;
};

const MAX_TRACKED_SOURCES = 2000;

function getState(name: string): RateLimitState {
  const holder = globalThis as RateLimitHolder;
  if (!holder.__dinotalkRateLimits) {
    holder.__dinotalkRateLimits = new Map();
  }
  let state = holder.__dinotalkRateLimits.get(name);
  if (!state) {
    state = { sources: new Map(), global: [] };
    holder.__dinotalkRateLimits.set(name, state);
  }
  return state;
}

function prune(hits: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((ts) => ts > cutoff);
}

function pruneSources(state: RateLimitState): void {
  if (state.sources.size <= MAX_TRACKED_SOURCES) return;
  for (const [key, hits] of state.sources) {
    if (hits.length === 0) state.sources.delete(key);
  }
}

export function getRequestSourceKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "local";
}

export function isRateLimited(
  name: string,
  source: string,
  max: number,
  windowMs: number,
  globalMax?: number
): boolean {
  const now = Date.now();
  const state = getState(name);
  const hits = prune(state.sources.get(source) ?? [], windowMs, now);
  state.sources.set(source, hits);
  state.global = prune(state.global, windowMs, now);
  if (hits.length >= max) return true;
  return globalMax !== undefined && state.global.length >= globalMax;
}

export function noteRateLimitFailure(name: string, source: string, windowMs: number): void {
  const now = Date.now();
  const state = getState(name);
  const hits = prune(state.sources.get(source) ?? [], windowMs, now);
  hits.push(now);
  state.sources.set(source, hits);
  state.global = prune(state.global, windowMs, now);
  state.global.push(now);
  pruneSources(state);
}

export function clearRateLimitFailures(name: string, source: string): void {
  getState(name).sources.delete(source);
}

export function resetRateLimit(name: string): void {
  const holder = globalThis as RateLimitHolder;
  holder.__dinotalkRateLimits?.delete(name);
}

export function consumeRateLimit(
  name: string,
  source: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const state = getState(name);
  const hits = prune(state.sources.get(source) ?? [], windowMs, now);
  if (hits.length >= max) {
    state.sources.set(source, hits);
    return true;
  }
  hits.push(now);
  state.sources.set(source, hits);
  pruneSources(state);
  return false;
}
