// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class {}, session: {} }));
vi.mock('@fitts/probes/page.js?raw', () => ({ default: '' }));

const { destructiveRequest, longestArray } = await import('../../src/main/site/site-window');

describe('the gate’s network rules (§13)', () => {
  it('holds DELETE, payment POSTs, and any write from a destructive-named control', () => {
    expect(destructiveRequest('DELETE', 'http://localhost/api/conversations/12', false)).toBe(true);
    expect(destructiveRequest('POST', 'http://localhost/api/checkout', false)).toBe(true);
    expect(destructiveRequest('POST', 'http://localhost/api/billing/charge', false)).toBe(true);
    expect(destructiveRequest('PATCH', 'http://localhost/api/messages/3', true)).toBe(true);
  });

  it('lets reads and ordinary writes through', () => {
    expect(destructiveRequest('GET', 'http://localhost/api/conversations/12', true)).toBe(false);
    expect(destructiveRequest('POST', 'http://localhost/api/messages', false)).toBe(false);
    expect(destructiveRequest('POST', 'http://localhost/api/payloads', false)).toBe(false);
  });

  it('counts the longest JSON array (payload probe)', () => {
    expect(longestArray('[1,2,3]')).toBe(3);
    expect(longestArray('{"query":"x","items":[1,2]}')).toBe(2);
    expect(longestArray('not json')).toBe(0);
  });
});
