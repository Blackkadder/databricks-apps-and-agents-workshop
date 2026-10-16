import { randomUUID } from 'node:crypto';
import { HomeAdvisorError } from './errors.js';
import type { HomeAdvisorSession } from './types.js';

export class HomeAdvisorSessions {
  private readonly sessions = new Map<string, HomeAdvisorSession>();

  constructor(
    private readonly ttlMs = 30 * 60_000,
    private readonly maxSessions = 500
  ) {}

  acquire(sessionId?: string): HomeAdvisorSession {
    this.prune();
    const id = sessionId ?? randomUUID();
    let session = this.sessions.get(id);
    if (!session) {
      if (sessionId)
        throw new HomeAdvisorError('CONVERSATION_NOT_FOUND', 'Conversation session was not found.', 404, false);
      session = { id, touchedAt: Date.now() };
      this.sessions.set(id, session);
    }
    if (session.active) {
      throw new HomeAdvisorError('CONVERSATION_BUSY', 'This conversation already has an active request.', 409, true);
    }
    session.touchedAt = Date.now();
    session.active = new AbortController();
    return session;
  }

  release(session: HomeAdvisorSession): void {
    session.active = undefined;
    session.touchedAt = Date.now();
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.active) return false;
    session.active.abort();
    return true;
  }

  reset(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    session?.active?.abort();
    return this.sessions.delete(sessionId);
  }

  stats() {
    this.prune();
    return {
      sessions: this.sessions.size,
      active: [...this.sessions.values()].filter((session) => session.active !== undefined).length,
    };
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, session] of this.sessions) {
      if (!session.active && session.touchedAt < cutoff) this.sessions.delete(id);
    }
    while (this.sessions.size >= this.maxSessions) {
      const inactive = [...this.sessions.entries()].find(([, session]) => !session.active);
      if (!inactive) break;
      this.sessions.delete(inactive[0]);
    }
  }
}
