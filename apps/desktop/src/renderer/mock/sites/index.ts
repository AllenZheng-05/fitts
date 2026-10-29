import { createElement, type ReactNode } from 'react';
import { DEMO_CHAT } from '../fixtures/projects';
import { DemoChatSite } from './DemoChatSite';
import { GenericSite } from './GenericSite';
import type { MockSiteProps } from './types';

export type { MockSiteProps };

/** Renders the mock "your site" for a project (SPEC §9.4). Hartwell arrives in M7. */
export function renderSite(projectId: string, props: MockSiteProps): ReactNode {
  if (projectId === DEMO_CHAT) return createElement(DemoChatSite, props);
  return createElement(GenericSite, props);
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
