import { copy } from '../../copy';
import { FittsMark } from './FittsMark';

/** Mark (30px) plus "Fitts" in Bricolage 800 21px (SPEC §5.4). Not a link. */
export function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <FittsMark size={30} />
      <span className="font-display text-[21px] font-extrabold tracking-[-0.02em] text-ink">
        {copy.app.name}
      </span>
    </div>
  );
}
