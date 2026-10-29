import { createElement, type ReactNode } from 'react';
import { DEMO_CHAT, HARTWELL } from '../fixtures/projects';
import { DemoChatSite } from './DemoChatSite';
import { GenericSite } from './GenericSite';
import { HartwellSite } from './HartwellSite';
import type { MockSiteProps } from './types';

export type { MockSiteProps };

/** Renders the mock "your site" for a project (SPEC §9.4). */
export function renderSite(projectId: string, props: MockSiteProps): ReactNode {
  if (projectId === DEMO_CHAT) return createElement(DemoChatSite, props);
  if (projectId === HARTWELL) return createElement(HartwellSite, props);
  return createElement(GenericSite, props);
}

/** Where the site view starts for a project, and where the Done preview opens. */
export function startRoute(projectId: string, preview = false): string {
  if (projectId === DEMO_CHAT) return preview ? '/compose/confirm' : '/compose';
  return '/';
}

/** The page Fitts is on when it acts on an element (audit overlays follow it, M5). */
export const ROUTE_FOR_REF: Record<string, string> = {
  'inbox-compose': '/',
  'compose-to': '/compose/recipient',
  'compose-next': '/compose/recipient',
  'compose-send': '/compose/confirm',
  'confirm-send': '/compose/confirm',
  'search-input': '/search',
  'thread-delete': '/contacts/grandma',
  'settings-list': '/settings',
};
