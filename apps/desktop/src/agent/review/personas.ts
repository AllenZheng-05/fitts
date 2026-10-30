// The five reviewer personas (SPEC-phase2 §8.1). Their prompts live in docs/prompts/reviewers;
// their names are what a finding's `agreement.who` shows.
import shared from '../../../../../docs/prompts/reviewers/_shared.md?raw';
import accessibility from '../../../../../docs/prompts/reviewers/accessibility.md?raw';
import novice from '../../../../../docs/prompts/reviewers/novice.md?raw';
import powerUser from '../../../../../docs/prompts/reviewers/power-user.md?raw';
import trust from '../../../../../docs/prompts/reviewers/trust.md?raw';
import visualDesign from '../../../../../docs/prompts/reviewers/visual-design.md?raw';

export interface Persona {
  id: string;
  name: string;
  instructions: string;
}

/** In roster order: the router's `reviewerRoster` gives one model per persona. */
export const PERSONAS: Persona[] = [
  { id: 'novice', name: 'Novice', instructions: `${novice}\n\n${shared}` },
  { id: 'power-user', name: 'Power user', instructions: `${powerUser}\n\n${shared}` },
  { id: 'accessibility', name: 'Accessibility', instructions: `${accessibility}\n\n${shared}` },
  { id: 'visual-design', name: 'Visual design', instructions: `${visualDesign}\n\n${shared}` },
  { id: 'trust', name: 'Trust & ethics', instructions: `${trust}\n\n${shared}` },
];
