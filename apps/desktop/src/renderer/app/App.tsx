import { copy } from '../copy';

/** M0 placeholder. The router (Welcome / Workspace / Settings) replaces it in M3. */
export function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2 bg-paper">
      <h1 className="font-display text-[68px] leading-[0.98] font-extrabold tracking-[-0.035em] text-ink">
        {copy.app.name}
      </h1>
      <p className="text-[13px] text-muted">{copy.app.scaffoldCaption}</p>
    </main>
  );
}
