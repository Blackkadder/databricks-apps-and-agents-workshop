import type { SearchConstraints } from './types.js';

export interface SessionState {
  id: string;
  shortlist: string[];
  lastConstraints: SearchConstraints;
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  touchedAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionState>();
  constructor(
    private readonly ttlMs = 30 * 60_000,
    private readonly maxSessions = 500
  ) {}

  getOrCreate(id: string): SessionState {
    this.prune();
    let state = this.sessions.get(id);
    if (!state) {
      state = { id, shortlist: [], lastConstraints: {}, turns: [], touchedAt: Date.now() };
      this.sessions.set(id, state);
    }
    state.touchedAt = Date.now();
    return state;
  }

  reset(id: string) {
    return this.sessions.delete(id);
  }
  size() {
    this.prune();
    return this.sessions.size;
  }
  private prune() {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, session] of this.sessions) if (session.touchedAt < cutoff) this.sessions.delete(id);
    while (this.sessions.size >= this.maxSessions) this.sessions.delete(this.sessions.keys().next().value!);
  }
}
