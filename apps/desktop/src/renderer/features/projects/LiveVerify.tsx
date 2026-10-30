import { Copy } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { RadioCard } from '../../components/fields';
import { IconButton } from '../../components/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl';
import { copy } from '../../copy';
import { format } from '../../lib/format';
import { VERIFY_MS, VERIFY_TOKEN } from '../../mock/detect';
import type { SiteVerification } from '@fitts/schema';
import { bridge } from '../../lib/bridge';
import { CONNECT_MS, DNS_RECORD_NAME, HOSTS, hostOf, type Host } from '../../mock/hosting';
import { useToasts } from '../../state/toasts';

type Method = 'host' | 'dns' | 'file';
type Connection = { host: Host; status: 'connecting' | 'connected' } | null;

const PANEL = 'flex flex-col gap-2.5 rounded-card border border-ink bg-surface-2 px-3.5 py-3';

/**
 * Proving you own a live site (docs/DECISIONS.md, "Site verification"). Connecting your host
 * comes first: the site counts as yours when its domain is on your account. A DNS record or
 * a file on the site are the fallbacks. All mocked in Phase 1.
 */
export function LiveVerify({
  url,
  onUrl,
  onVerifiedChange,
}: {
  url: string;
  onUrl: (url: string) => void;
  /** How the site was verified (for the re-check before each run), or null. */
  onVerifiedChange: (verification: Omit<SiteVerification, 'verifiedAt'> | null) => void;
}) {
  const [method, setMethod] = useState<Method>('host');
  const [connection, setConnection] = useState<Connection>(null);
  // DNS and file checks: which domain passed, so editing the URL undoes it.
  const [checkedDomain, setCheckedDomain] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /** Why the last real check failed, in Fitts's words. */
  const [problem, setProblem] = useState<string | null>(null);
  const domain = hostOf(url);
  const verifier = bridge().verify;
  // Phase 1's fixed token stays for the mock; real checks use this domain's own token.
  const token = verifier ? tokenFor(domain) : VERIFY_TOKEN;

  const connected = connection?.status === 'connected' ? connection.host : null;
  const hostedSite = connected?.sites.find((site) => site.domain === domain);
  const verified =
    domain !== '' &&
    (method === 'host' ? hostedSite !== undefined : checkedDomain === domain && !checking);

  const hostId = connected?.id;
  useEffect(
    () =>
      onVerifiedChange(
        !verified
          ? null
          : method === 'host'
            ? { method, ...(hostId ? { host: hostId } : {}) }
            : { method, token },
      ),
    [verified, method, hostId, token, onVerifiedChange],
  );

  useEffect(() => {
    if (connection?.status !== 'connecting') return;
    let cancelled = false;
    const done = (host: Host) => {
      if (!cancelled) setConnection({ host, status: 'connected' });
    };
    // GitHub Pages is real when the GitHub CLI is there (§4.2); the other hosts are mocked.
    if (connection.host.id === 'github-pages' && verifier) {
      void verifier.githubPages().then((res) => {
        if (res === null) return done(connection.host);
        if ('error' in res) {
          if (!cancelled) {
            setProblem(res.error);
            setConnection(null);
          }
          return;
        }
        done({ ...connection.host, sites: res.sites });
      });
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => done(connection.host), CONNECT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, verifier]);

  useEffect(() => {
    if (!checking || (method !== 'dns' && method !== 'file')) return;
    let cancelled = false;
    const pass = () => {
      if (cancelled) return;
      setChecking(false);
      setCheckedDomain(domain);
    };
    if (!verifier) {
      const timer = setTimeout(pass, VERIFY_MS);
      return () => clearTimeout(timer);
    }
    void verifier.check(method, domain, token).then((res) => {
      if (cancelled) return;
      if (res.offline) {
        setTimeout(pass, VERIFY_MS);
        return;
      }
      if (res.ok) pass();
      else {
        setChecking(false);
        setProblem(res.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [checking, domain, method, token, verifier]);

  const check = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={!domain || checking}
        onClick={() => {
          setCheckedDomain(null);
          setProblem(null);
          setChecking(true);
        }}
      >
        {checking ? copy.addProject.checking : copy.addProject.checkNow}
      </Button>
      {!domain && <span className="text-[13px] text-muted">{copy.addProject.needsUrl}</span>}
      {verified && (
        <Chip tone="mint" role="status">
          {copy.addProject.verified}
        </Chip>
      )}
      {problem && !checking && (
        <span role="status" className="text-[13px] text-ink-2">
          {problem}
        </span>
      )}
    </div>
  );

  return (
    <section aria-labelledby="verify-title" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 id="verify-title" className="font-display text-[17px] font-bold">
          {copy.addProject.verifyTitle}
        </h2>
        <p className="text-[13px] text-ink-2">{copy.addProject.verifyNote}</p>
      </div>
      <SegmentedControl
        label={copy.addProject.verifyMethod}
        fill
        selected={method}
        onSelect={(id) => {
          setMethod(id as Method);
          setChecking(false);
          setCheckedDomain(null);
        }}
        segments={[
          { id: 'host', label: copy.addProject.methods.host },
          { id: 'dns', label: copy.addProject.methods.dns },
          { id: 'file', label: copy.addProject.methods.file },
        ]}
      />

      {method === 'host' && (
        <div className={PANEL}>
          {connection === null ? (
            <>
              <p className="text-[14px] leading-normal">
                <Chip tone="mint" className="mr-1.5 px-2 py-0.5 align-[1px]">
                  {copy.addProject.recommended}
                </Chip>
                {copy.addProject.hostIntro}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {HOSTS.map((host) => (
                  <Button
                    key={host.id}
                    size="md"
                    onClick={() => setConnection({ host, status: 'connecting' })}
                  >
                    {format(copy.addProject.connect, { host: host.name })}
                  </Button>
                ))}
              </div>
            </>
          ) : connection.status === 'connecting' ? (
            <p role="status" className="text-[14px] leading-normal text-cobalt-deep">
              {format(copy.addProject.connecting, { host: connection.host.name })}
            </p>
          ) : (
            <ConnectedHost
              host={connection.host}
              domain={domain}
              onPick={(siteDomain) => onUrl(`https://${siteDomain}`)}
              onSwitch={() => setConnection(null)}
            />
          )}
        </div>
      )}

      {method === 'dns' && (
        <div className={PANEL}>
          <p className="text-[14px] leading-normal">{copy.addProject.dnsIntro}</p>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[14px]">
            <dt className="font-semibold">{copy.addProject.dnsName}</dt>
            <dd>
              <CopyValue
                value={`${DNS_RECORD_NAME}.${domain || 'example.com'}`}
                label={copy.addProject.copyName}
              />
            </dd>
            <dt className="font-semibold">{copy.addProject.dnsValue}</dt>
            <dd>
              <CopyValue value={token} label={copy.addProject.copyToken} />
            </dd>
          </dl>
          {check}
        </div>
      )}

      {method === 'file' && (
        <div className={PANEL}>
          <p className="text-[14px] leading-normal">{copy.addProject.verifyIntro}</p>
          <span className="font-mono text-[13px]">{copy.addProject.verifyPath}</span>
          <CopyValue value={token} label={copy.addProject.copyToken} />
          {check}
        </div>
      )}
    </section>
  );
}

/** The connected account: your sites as choices, and whether the URL is one of them. */
function ConnectedHost({
  host,
  domain,
  onPick,
  onSwitch,
}: {
  host: Host;
  domain: string;
  onPick: (domain: string) => void;
  onSwitch: () => void;
}) {
  const legendId = useId();
  const match = host.sites.find((site) => site.domain === domain);
  return (
    <>
      <div className="flex items-center gap-2">
        <Chip tone="mint" className="px-2 py-0.5">
          {format(copy.addProject.connected, { host: host.name })}
        </Chip>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onSwitch}
          className="text-[13px] font-semibold text-cobalt-ink underline hover:text-cobalt-deep"
        >
          {copy.addProject.switchHost}
        </button>
      </div>
      <fieldset aria-labelledby={legendId} className="flex flex-col gap-1.5">
        <span id={legendId} className="text-[13px] font-semibold">
          {format(copy.addProject.pickSite, { host: host.name })}
        </span>
        {host.sites.map((site) => (
          <RadioCard
            key={site.domain}
            name="hosted-site"
            value={site.domain}
            checked={site.domain === domain}
            onChange={() => onPick(site.domain)}
            className="bg-card"
          >
            <strong>{site.name}</strong>
            <span className="font-mono text-[13px] text-ink-2"> · {site.domain}</span>
          </RadioCard>
        ))}
      </fieldset>
      {match ? (
        <Chip tone="mint" role="status" className="self-start">
          {format(copy.addProject.verifiedVia, { host: host.name })}
        </Chip>
      ) : (
        domain !== '' && (
          <p role="status" className="text-[13px] leading-normal text-sun-ink">
            {format(copy.addProject.notOnAccount, { domain, host: host.name })}
          </p>
        )
      )}
    </>
  );
}

/** A monospace value with a copy button. */
function CopyValue({ value, label }: { value: string; label: string }): ReactNode {
  const showToast = useToasts((s) => s.show);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-row border border-ink bg-card px-3 py-2 font-mono text-[13px]">
        {value}
      </code>
      <IconButton
        aria-label={label}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => showToast(copy.addProject.copied));
        }}
        icon={<Copy size={16} aria-hidden="true" />}
      />
    </div>
  );
}

/** A random token per domain, kept on this machine, so each site proves itself with its own. */
function tokenFor(domain: string): string {
  if (!domain) return '';
  const KEY = 'fitts.verifyTokens';
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    all = {};
  }
  const existing = all[domain];
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const token = `fitts-verify=${[...bytes].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')}`;
  all[domain] = token;
  localStorage.setItem(KEY, JSON.stringify(all));
  return token;
}
