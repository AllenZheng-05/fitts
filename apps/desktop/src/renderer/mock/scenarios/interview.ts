// Interview scripts (SPEC §6.3). Fitts asks one question at a time; the mock maps any
// answer to the next brief fields.
import { copy } from '../../copy';
import { format } from '../../lib/format';
import type { InterviewStep } from '../../state/script';

export const FEEL_REPLIES = ['Calm and simple', 'Bright and friendly', 'Match our brand'];

/** demo/chat: the conversation in Interview.html. Brief values are Fitts's summaries. */
export const demoChatInterview: InterviewStep[] = [
  {
    fill: () => ({ for: 'Family messaging', who: 'Older adults, some with low vision' }),
    reply: (_s, ctx) =>
      ctx.say(format(copy.fitts.interviewFollowUp, { screen: ctx.profile.screen })),
  },
  {
    fill: () => ({ pain: 'No send confirmation · mixed labels' }),
    reply: (_s, ctx) => {
      ctx.say(copy.fitts.interviewTieBack);
      ctx.post({ type: 'quick-replies', options: FEEL_REPLIES });
    },
  },
  {
    fill: (text) => ({ feel: text || FEEL_REPLIES[0] }),
    reply: (_s, ctx) => ctx.say(copy.fitts.interviewWrapUp),
  },
];

const GENERIC_WHO = 'Who uses it most?';
const GENERIC_PAIN = 'Where do people get stuck?';
const GENERIC_FEEL = '**How should it feel when they open it?**';

/** Any other project: one field per answer, in the order For, Who, Pain, Feel. */
export const genericInterview: InterviewStep[] = [
  { fill: (text) => ({ for: text }), reply: (_s, ctx) => void ctx.say(GENERIC_WHO) },
  { fill: (text) => ({ who: text }), reply: (_s, ctx) => void ctx.say(GENERIC_PAIN) },
  {
    fill: (text) => ({ pain: text }),
    reply: (_s, ctx) => {
      ctx.say(GENERIC_FEEL);
      ctx.post({ type: 'quick-replies', options: FEEL_REPLIES });
    },
  },
  {
    fill: (text) => ({ feel: text }),
    reply: (_s, ctx) => void ctx.say(copy.fitts.interviewWrapUp),
  },
];
