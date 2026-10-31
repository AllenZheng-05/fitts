import type { GitHubStatus } from '@fitts/schema';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { RichText } from '../../components/RichText';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { format } from '../../lib/format';
import { useGitHub } from '../../lib/github';

/**
 * Sign in with GitHub (Settings › Keys): what Fitts may do once you do, the code to enter on
 * github.com while you sign in, and who you're signed in as.
 */
export function GitHubSection() {
  const status = useGitHub();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<GitHubStatus | null>(null);
  const github = bridge().github;
  const shown = status?.state === 'code' || !local ? status : local;
  if (!github || !shown || shown.state === 'unavailable')
    return (
      <div className="flex flex-col gap-1.5 rounded-card border border-ink p-3.5">
        <strong className="text-[15px]">{copy.github.title}</strong>
        <span className="text-[13px] text-muted">{copy.github.unavailable}</span>
      </div>
    );
  const signIn = () => {
    setBusy(true);
    void github.signIn().then((s) => {
      setBusy(false);
      setLocal(s);
      if (s.state === 'code') bridge().openLink?.(s.url);
    });
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-ink p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <strong className="text-[15px]">{copy.github.title}</strong>
          <span className="text-[13px] text-muted">{copy.github.hint}</span>
        </div>
        {shown.state === 'signed-in' ? (
          <>
            <Chip tone="mint">{format(copy.github.signedIn, { login: shown.login })}</Chip>
            <Button size="sm" onClick={() => github.signOut()}>
              {copy.github.signOut}
            </Button>
          </>
        ) : shown.state === 'code' ? (
          <Button
            size="sm"
            onClick={() => {
              github.cancel();
              setLocal({ state: 'signed-out' });
            }}
          >
            {copy.overlay.cancel}
          </Button>
        ) : (
          <Button size="sm" variant="primary" disabled={busy} onClick={signIn}>
            {copy.github.signIn}
          </Button>
        )}
      </div>
      {shown.state === 'code' && (
        <div role="status" className="flex flex-col gap-1.5 rounded-control bg-cobalt-tint p-3">
          <span className="text-[13px]">{copy.github.enterCode}</span>
          <span className="font-mono text-[24px] font-bold tracking-[0.12em]">{shown.code}</span>
          <Button size="sm" className="self-start" onClick={() => bridge().openLink?.(shown.url)}>
            {copy.github.openGitHub}
          </Button>
        </div>
      )}
      {shown.state === 'signed-in' && shown.installUrl && (
        <Button
          size="sm"
          className="self-start"
          onClick={() => bridge().openLink?.(shown.installUrl ?? '')}
        >
          {copy.github.chooseRepos}
        </Button>
      )}
      {shown.state === 'error' && (
        <span role="alert" className="text-[13px] text-sun-ink">
          {shown.message}
        </span>
      )}
      <p className="text-[13px] leading-normal text-ink-2">
        <RichText text={copy.github.what} />
      </p>
    </div>
  );
}
