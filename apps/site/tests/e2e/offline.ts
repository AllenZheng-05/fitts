// Tests make no network calls: anything that isn't the local preview server is aborted. The
// homepage embeds the demo video from YouTube, so without this every Home test would load it,
// and axe would check YouTube's player instead of our page.
import type { Page } from '@playwright/test';

export const blockOutside = ({ page }: { page: Page }) =>
  page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
