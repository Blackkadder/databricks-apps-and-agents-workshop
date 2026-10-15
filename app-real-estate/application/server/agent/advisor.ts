import { randomUUID } from 'node:crypto';
import { FAIR_HOUSING_RESPONSE, isSteeringRequest } from './guardrails.js';
import { SessionStore } from './sessions.js';
import { Tracer } from './tracing.js';
import type { AgentReply, Listing, SearchConstraints } from './types.js';
import { AgentTools } from './tools.js';

export const REAL_ESTATE_SYSTEM_PROMPT = `You are a real-estate listing advisor operating on a synthetic demonstration dataset.
Use listing tools for every factual claim. Never invent availability, neighborhood facts, or listing attributes.
Every recommendation must cite its stable listing ID. State clearly when no listing meets every constraint; only then may you identify any relaxed constraints.
Use the deterministic comparison tool for numeric ranking or calculations.
Do not infer protected characteristics or steer based on race, color, religion, sex (including gender identity and sexual orientation), disability, familial status, or national origin. Do not characterize neighborhood safety, demographics, crime, or school quality. Offer objective listing attributes instead.`;

function parseConstraints(message: string, previous: SearchConstraints): SearchConstraints {
  const next: SearchConstraints = /\b(which one|compare|those|them|shortlist)\b/i.test(message) ? { ...previous } : {};
  const price = message.match(/(?:under|max(?:imum)?|below)\s*\$?([\d,.]+)\s*(k|m(?:illion)?)?/i);
  if (price) {
    let value = Number(price[1].replace(/,/g, ''));
    if (price[2]?.toLowerCase() === 'k') value *= 1_000;
    if (price[2]?.toLowerCase().startsWith('m')) value *= 1_000_000;
    next.maxPrice = value;
  }
  const beds = message.match(/(\d+)\s*\+?\s*(?:bed|bedroom)/i);
  if (beds) next.minBedrooms = Number(beds[1]);
  if (/outdoor|balcony|yard|terrace|patio/i.test(message)) next.hasOutdoorSpace = true;
  if (/parking|garage/i.test(message)) next.hasParking = true;
  if (/transit|subway|train/i.test(message)) next.minTransitScore = 70;
  const desiredCount = message.match(
    /\b(?:show|find|give)\s+(?:me\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
  );
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const requestedLimit = desiredCount
    ? (numberWords[desiredCount[1].toLowerCase()] ?? Number(desiredCount[1]))
    : undefined;
  next.limit = requestedLimit ? Math.min(requestedLimit, 10) : (next.limit ?? 5);
  next.query = message;
  return next;
}

function cite(listing: Listing): string {
  return `**${listing.title}** [${listing.listing_id}] — $${listing.price_usd.toLocaleString()}, ${listing.bedrooms} bd, ${listing.bathrooms} ba, ${listing.square_feet.toLocaleString()} sq ft ($${listing.price_per_sqft.toLocaleString()}/sq ft), ${listing.neighborhood}.`;
}

export class RealEstateAdvisor {
  constructor(
    private readonly tools: AgentTools,
    private readonly sessions = new SessionStore(),
    private readonly tracer = new Tracer()
  ) {}

  async chat(sessionId: string | undefined, message: string): Promise<AgentReply> {
    const id = sessionId ?? randomUUID();
    const traceId = this.tracer.newTraceId();
    const started = performance.now();
    await this.tracer.record(traceId, 'agent.start', 'chat', { sessionId: id, messageLength: message.length });
    const session = this.sessions.getOrCreate(id);
    session.turns.push({ role: 'user', content: message });

    if (isSteeringRequest(message)) {
      session.turns.push({ role: 'assistant', content: FAIR_HOUSING_RESPONSE });
      await this.tracer.record(
        traceId,
        'agent.end',
        'guardrail',
        { guardrailTriggered: true },
        Math.round(performance.now() - started)
      );
      return {
        message: FAIR_HOUSING_RESPONSE,
        listingIds: [],
        relaxedConstraints: [],
        sessionId: id,
        traceId,
        guardrailTriggered: true,
      };
    }

    const asksForComparison =
      /\b(best value|price per square|compare|lowest price|largest|highest transit|highest walk)\b/i.test(message);
    let response: string;
    let listingIds: string[] = [];
    let relaxedConstraints: string[] = [];

    if (asksForComparison && session.shortlist.length >= 2) {
      const metric = /largest|square feet/i.test(message)
        ? 'square_feet'
        : /transit/i.test(message)
          ? 'transit_score'
          : /walk/i.test(message)
            ? 'walk_score'
            : /lowest price(?! per)/i.test(message)
              ? 'price_usd'
              : 'price_per_sqft';
      const direction = metric === 'square_feet' || metric.endsWith('score') ? 'highest' : 'lowest';
      const result = await this.tracer.tool(
        traceId,
        'compare_listings',
        { count: session.shortlist.length, metric },
        () => this.tools.compare({ listingIds: session.shortlist, metric, direction })
      );
      listingIds = result.rows.map((row) => row.listing_id);
      response =
        `${result.winner.listing_id} ranks ${direction} for ${metric.replace(/_/g, ' ')} at ${result.winner.value.toLocaleString()}. ` +
        `Calculated comparison: ${result.rows.map((row) => `[${row.listing_id}]: ${row.value.toLocaleString()}`).join('; ')}.`;
      if (/quiet/i.test(message))
        response += ' The dataset has no noise or quietness field, so I cannot rank that preference.';
    } else {
      const constraints = parseConstraints(message, session.lastConstraints);
      const result = await this.tracer.tool(traceId, 'search_listings', { limit: constraints.limit ?? 5 }, () =>
        this.tools.search(constraints)
      );
      session.lastConstraints = constraints;
      session.shortlist = result.listings.map((listing) => listing.listing_id);
      listingIds = [...session.shortlist];
      relaxedConstraints = result.relaxedConstraints;
      if (!result.listings.length) {
        response =
          'No listings in the synthetic dataset satisfy all of those constraints. I did not relax any constraints. Try increasing the price limit or removing an amenity.';
      } else {
        const disclosure = relaxedConstraints.length
          ? `No listing met every constraint. The search explicitly relaxed: ${relaxedConstraints.join(', ')}.\n\n`
          : `I found ${result.total} listing${result.total === 1 ? '' : 's'} matching the stated constraints.\n\n`;
        response = disclosure + result.listings.map(cite).join('\n\n');
      }
    }

    session.turns.push({ role: 'assistant', content: response });
    await this.tracer.record(
      traceId,
      'agent.end',
      'chat',
      { citationCount: listingIds.length },
      Math.round(performance.now() - started)
    );
    return { message: response, listingIds, relaxedConstraints, sessionId: id, traceId, guardrailTriggered: false };
  }

  reset(sessionId: string) {
    return this.sessions.reset(sessionId);
  }
  health() {
    return { sessions: this.sessions.size() };
  }
}
