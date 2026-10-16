import { Plugin, type PluginManifest, toPlugin } from '@databricks/appkit';
import { ZodError } from 'zod';
import { getListingRepository } from '../agent/repository-registry.js';
import { HomeAdvisorError, normalizeHomeAdvisorError } from './errors.js';
import { getHomeAdvisorGenie, isHomeAdvisorGenieBound } from './registry.js';
import { homeAdvisorChatSchema, homeAdvisorSessionSchema } from './schemas.js';
import { HomeAdvisorService } from './service.js';

export class HomeAdvisorPlugin extends Plugin {
  static manifest = {
    name: 'home-advisor',
    displayName: 'Genie Home Advisor',
    description: 'Grounded Home Advisor over the Delta listings Genie Space',
    resources: { required: [], optional: [] },
  } as PluginManifest<'home-advisor'>;

  private readonly service = new HomeAdvisorService(getHomeAdvisorGenie, getListingRepository);

  injectRoutes(router: Parameters<Plugin['injectRoutes']>[0]): void {
    this.route(router, {
      name: 'chat',
      method: 'post',
      path: '/chat',
      handler: async (req, res) => {
        try {
          const input = homeAdvisorChatSchema.parse(req.body);
          res.json(await this.service.chat(input.message, input.sessionId));
        } catch (error) {
          this.respondError(res, error);
        }
      },
    });
    this.route(router, {
      name: 'cancel',
      method: 'post',
      path: '/cancel',
      handler: async (req, res) => {
        try {
          const { sessionId } = homeAdvisorSessionSchema.parse(req.body);
          const canceled = await Promise.resolve(this.service.cancel(sessionId));
          res.status(canceled ? 202 : 200).json({ ok: true, canceled });
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
          const { sessionId } = homeAdvisorSessionSchema.parse(req.body);
          const cleared = await Promise.resolve(this.service.reset(sessionId));
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
        try {
          const health = await this.service.health(isHomeAdvisorGenieBound());
          res.status(health.ok ? 200 : 503).json(health);
        } catch (error) {
          this.respondError(res, error);
        }
      },
    });
    this.route(router, {
      name: 'validate',
      method: 'get',
      path: '/validate',
      handler: async (_req, res) => {
        try {
          const health = await this.service.health(isHomeAdvisorGenieBound());
          const checks = [
            { component: 'genie', ...health.genie },
            { component: 'lakebase-citation-verification', ...health.repository },
            { component: 'result-boundary', ok: health.maxListings === 100, detail: `maximum ${health.maxListings}` },
          ];
          const ok = checks.every((check) => check.ok);
          res.status(ok ? 200 : 503).json({ ok, checks });
        } catch (error) {
          this.respondError(res, error);
        }
      },
    });
  }

  private respondError(res: { status(code: number): { json(value: unknown): void } }, error: unknown): void {
    if (error instanceof ZodError) {
      res.status(400).json({ code: 'INVALID_REQUEST', retryable: false, issues: error.issues });
      return;
    }
    const typed = error instanceof HomeAdvisorError ? error : normalizeHomeAdvisorError(error);
    res.status(typed.status).json({ code: typed.code, message: typed.message, retryable: typed.retryable });
  }
}

export const homeAdvisor = toPlugin(HomeAdvisorPlugin);
