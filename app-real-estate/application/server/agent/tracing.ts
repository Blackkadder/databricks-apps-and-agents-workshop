import { randomUUID } from 'node:crypto';

export type TraceEventType = 'agent.start' | 'tool.start' | 'tool.end' | 'agent.end' | 'error';
export interface TraceEvent {
  traceId: string;
  at: string;
  type: TraceEventType;
  name: string;
  durationMs?: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface TraceSink {
  record(event: TraceEvent): void | Promise<void>;
}

export class MemoryTraceSink implements TraceSink {
  readonly events: TraceEvent[] = [];
  record(event: TraceEvent) {
    this.events.push(event);
  }
}

export class JsonTraceSink implements TraceSink {
  record(event: TraceEvent) {
    console.info(JSON.stringify({ component: 'real-estate-agent', ...event }));
  }
}

export class Tracer {
  constructor(private readonly sink: TraceSink = new JsonTraceSink()) {}
  newTraceId() {
    return randomUUID();
  }
  record(
    traceId: string,
    type: TraceEventType,
    name: string,
    attributes?: TraceEvent['attributes'],
    durationMs?: number
  ) {
    return this.sink.record({ traceId, at: new Date().toISOString(), type, name, attributes, durationMs });
  }
  async tool<T>(traceId: string, name: string, attributes: TraceEvent['attributes'], fn: () => Promise<T>): Promise<T> {
    const started = performance.now();
    await this.record(traceId, 'tool.start', name, attributes);
    try {
      const value = await fn();
      await this.record(traceId, 'tool.end', name, undefined, Math.round(performance.now() - started));
      return value;
    } catch (error) {
      await this.record(
        traceId,
        'error',
        name,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        Math.round(performance.now() - started)
      );
      throw error;
    }
  }
}
