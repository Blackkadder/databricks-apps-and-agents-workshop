import { Plugin, type PluginManifest, toPlugin } from '@databricks/appkit';
import { ZodError } from 'zod';
import { RealEstateAdvisor } from './advisor.js';
import { chatInputSchema, resetInputSchema } from './schemas.js';
import { AgentTools } from './tools.js';
import { getListingRepository, listingRepositoryHealth } from './repository-registry.js';

export class RealEstateAgentPlugin extends Plugin {
  static manifest = {
    name: 'real-estate-agent',
    displayName: 'Real Estate Advisor',
    description: 'Grounded, session-aware advisor over synthetic listings',
    resources: { required: [], optional: [] },
  } as PluginManifest<'real-estate-agent'>;

  private readonly advisor: RealEstateAdvisor;

  constructor(options: Record<string, unknown> = {}) {
    super(options);
    const lazyTools = new AgentTools({
      search: (input) => getListingRepository().search(input),
      getById: (id) => getListingRepository().getById(id),
      health: () => listingRepositoryHealth(),
    });
    this.advisor = new RealEstateAdvisor(lazyTools);
  }

  injectRoutes(router: Parameters<Plugin['injectRoutes']>[0]) {
    this.route(router, {
      name: 'chat',
      method: 'post',
      path: '/chat',
      handler: async (req, res) => {
        try {
          const input = chatInputSchema.parse(req.body);
          res.json(await this.advisor.chat(input.sessionId, input.message));
        } catch (error) {
          this.respondError(res, error);
        }
      },
    });
    this.route(router, {
      name: 'reset',
      method: 'post',
      path: '/reset',
      handler: async (req, res) => {
        try {
          const { sessionId } = resetInputSchema.parse(req.body);
          const cleared = await Promise.resolve(this.advisor.reset(sessionId));
          res.json({ ok: true, cleared });
        } catch (error) {
          this.respondError(res, error);
        }
      },
    });
    this.route(router, {
      name: 'health',
      method: 'get',
      path: '/health',
      handler: async (_req, res) => {
        const repository = await listingRepositoryHealth();
        res.status(repository.ok ? 200 : 503).json({ ok: repository.ok, repository, agent: this.advisor.health() });
      },
    });
    this.route(router, {
      name: 'validate',
      method: 'get',
      path: '/validate',
      handler: async (_req, res) => {
        const repository = await listingRepositoryHealth();
        const checks = [{ component: 'listing-repository', ok: repository.ok, detail: repository.detail ?? 'ready' }];
        res
          .status(checks.every((check) => check.ok) ? 200 : 503)
          .json({ ok: checks.every((check) => check.ok), checks });
      },
    });
  }

  private respondError(res: { status(code: number): { json(value: unknown): void } }, error: unknown) {
    if (error instanceof ZodError) return res.status(400).json({ error: 'INVALID_REQUEST', issues: error.issues });
    console.error('Real-estate agent request failed', error);
    return res
      .status(503)
      .json({ error: 'AGENT_UNAVAILABLE', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export const realEstateAgent = toPlugin(RealEstateAgentPlugin);
