import type { GenieClient } from './types.js';

let genieClient: GenieClient | undefined;

export function bindHomeAdvisorGenie(client: GenieClient): void {
  genieClient = client;
}

export function getHomeAdvisorGenie(): GenieClient {
  if (!genieClient) throw new Error('AppKit Genie plugin is not bound');
  return genieClient;
}

export function isHomeAdvisorGenieBound(): boolean {
  return genieClient !== undefined;
}
