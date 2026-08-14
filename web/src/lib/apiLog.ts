/**
 * A tiny pub/sub log of every backend call the UI makes.
 *
 * This exists for a specific reason: PawBook's logic lives in ~50
 * Edge Functions, and it's hard to tell from a pretty screen which
 * one a given tap actually hit. Every api.ts call records itself
 * here, and the API Inspector panel renders it live — so the UI
 * doubles as a map of the backend.
 */

export interface ApiLogEntry {
  id: string;
  fn: string;
  method: string;
  /** Which spec doc / backend concern this endpoint belongs to */
  area: string;
  status: "pending" | "ok" | "error" | "mock";
  ms?: number;
  detail?: string;
  /** Backend side-effects worth surfacing, e.g. Neo4j / APNs writes */
  effects?: string[];
  at: number;
}

type Listener = (entries: ApiLogEntry[]) => void;

const entries: ApiLogEntry[] = [];
const listeners = new Set<Listener>();
const MAX = 60;

function emit() {
  const snapshot = [...entries];
  listeners.forEach((l) => l(snapshot));
}

export function subscribeApiLog(l: Listener): () => void {
  listeners.add(l);
  l([...entries]);
  return () => listeners.delete(l);
}

export function startCall(
  fn: string,
  method: string,
  area: string,
  effects?: string[],
): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  entries.unshift({ id, fn, method, area, status: "pending", effects, at: Date.now() });
  if (entries.length > MAX) entries.length = MAX;
  emit();
  return id;
}

export function endCall(
  id: string,
  status: ApiLogEntry["status"],
  ms: number,
  detail?: string,
) {
  const e = entries.find((x) => x.id === id);
  if (e) {
    e.status = status;
    e.ms = ms;
    e.detail = detail;
    emit();
  }
}

export function clearApiLog() {
  entries.length = 0;
  emit();
}
