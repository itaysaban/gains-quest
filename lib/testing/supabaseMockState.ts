/**
 * Shared, resettable stand-in for the Supabase query builder used by every E2E flow test.
 * Not itself a jest mock — `lib/__mocks__/supabase.ts` wires this into `@/lib/supabase` via
 * `jest.mock('@/lib/supabase')`. Kept as a plain typed module (rather than living inside
 * `__mocks__`) so test files can import the control functions without tripping `tsc --noEmit`
 * against the real module's exports.
 */
import type { Session } from '@supabase/supabase-js';

export type MockResolution<T = unknown> = { data: T; error: { message: string } | null };

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

const responseQueues = new Map<string, MockResolution[]>();
const defaultResponses = new Map<string, MockResolution>();
export const supabaseMockCalls: RecordedCall[] = [];

/** Response returned for every call against `table` unless a queued one-shot response is pending. */
export function mockSupabaseResponse(table: string, response: MockResolution) {
  defaultResponses.set(table, response);
}

/** Consumed once, in FIFO order, before falling back to the default response for `table`. */
export function mockSupabaseResponseOnce(table: string, response: MockResolution) {
  if (!responseQueues.has(table)) responseQueues.set(table, []);
  responseQueues.get(table)!.push(response);
}

export function resetSupabaseMock() {
  responseQueues.clear();
  defaultResponses.clear();
  supabaseMockCalls.length = 0;
  mockSession = defaultMockSession;
}

function nextResponse(table: string): MockResolution {
  const queue = responseQueues.get(table);
  if (queue && queue.length > 0) {
    return queue.shift()!; // always drain — a queue of length 1 must still empty out on this call
  }
  const fallback = defaultResponses.get(table);
  if (fallback) return fallback;
  throw new Error(`[supabaseMock] no response configured for "${table}". Call mockSupabaseResponse first.`);
}

function makeChain(table: string): PromiseLike<MockResolution> {
  const chainMethods = ['select', 'eq', 'neq', 'order', 'limit', 'in', 'upsert', 'insert', 'update', 'delete', 'single', 'maybeSingle'];
  const chain: Record<string, unknown> = {};
  for (const method of chainMethods) {
    chain[method] = (...args: unknown[]) => {
      supabaseMockCalls.push({ table, method, args });
      return chain;
    };
  }
  chain.then = (onFulfilled: (r: MockResolution) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(nextResponse(table)).then(onFulfilled, onRejected);
  return chain as unknown as PromiseLike<MockResolution>;
}

export const defaultMockSession = {
  user: { id: 'test-user-id', email: 'test@example.com' },
  access_token: 'test-access-token',
} as unknown as Session;

let mockSession: Session | null = defaultMockSession;

export function setMockSession(session: Session | null) {
  mockSession = session;
}

export const mockSupabaseClient = {
  from: (table: string) => makeChain(table),
  rpc: (name: string, args?: unknown) => {
    supabaseMockCalls.push({ table: `rpc:${name}`, method: 'rpc', args: [args] });
    return makeChain(`rpc:${name}`);
  },
  auth: {
    getSession: async () => ({ data: { session: mockSession }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
};
