// Settings › Projects › "What Fitts remembers" (SPEC-phase4 §4.3): the rules and tastes the
// owner has given a project, each deletable, and "Forget everything".
import type { ProjectMemory } from '@fitts/schema';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { copy } from '../../copy';
import { bridge } from '../../lib/bridge';
import { format } from '../../lib/format';

const EMPTY: ProjectMemory = { rules: [], likes: [], dislikes: [] };

export function Remembers({ projectId }: { projectId: string }) {
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const api = bridge().memory;
  useEffect(() => {
    if (!api) return;
    let current = true;
    void api.get(projectId).then((m) => current && setMemory(m));
    return () => {
      current = false;
    };
  }, [api, projectId]);
  const r = copy.settings.remembers;
  const m = memory ?? EMPTY;
  const n = m.rules.length + m.likes.length + m.dislikes.length;
  if (!api) return null;
  return (
    <div className="flex flex-col gap-1.5 pl-1 text-[13px]">
      <span className="font-semibold">{r.title}</span>
      {n === 0 ? (
        <span className="text-muted">{r.nothing}</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {m.rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2">
              <Chip
                tone={
                  rule.kind === 'not-a-problem'
                    ? 'neutral'
                    : rule.kind === 'is-a-problem'
                      ? 'coral'
                      : 'sun'
                }
                className="px-2 py-0.5"
              >
                {r.kinds[rule.kind]}
              </Chip>
              <span className="min-w-0 flex-1 truncate">
                {rule.match.titleKey?.split('|')[1] || rule.match.text || rule.id}
                <span className="text-muted"> · {rule.reason}</span>
              </span>
              <Button
                size="inline"
                aria-label={format(r.forgetOne, { what: rule.reason })}
                onClick={() => void api.delete(projectId, rule.id).then(setMemory)}
              >
                {r.forget}
              </Button>
            </li>
          ))}
          {m.likes.map((like) => (
            <li key={`like-${like}`} className="flex items-center gap-2">
              <Chip tone="mint" className="px-2 py-0.5">
                {r.like}
              </Chip>
              <span className="min-w-0 flex-1 truncate">{like}</span>
            </li>
          ))}
          {m.dislikes.map((dislike) => (
            <li key={`dislike-${dislike}`} className="flex items-center gap-2">
              <Chip tone="neutral" className="px-2 py-0.5">
                {r.dislike}
              </Chip>
              <span className="min-w-0 flex-1 truncate">{dislike}</span>
            </li>
          ))}
        </ul>
      )}
      {n > 0 && (
        <Button
          size="sm"
          className="self-start"
          onClick={() => void api.clear(projectId).then(setMemory)}
        >
          {r.forgetAll}
        </Button>
      )}
    </div>
  );
}
