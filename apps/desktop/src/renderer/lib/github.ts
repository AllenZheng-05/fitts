import type { GitHubStatus } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { bridge } from './bridge';

/** The GitHub sign-in as main reports it, kept in step with its events. */
export function useGitHub(): GitHubStatus | null {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  useEffect(() => {
    const github = bridge().github;
    if (!github) return;
    void github.status().then(setStatus);
    return github.onStatus(setStatus);
  }, []);
  return status;
}
