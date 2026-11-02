// `pnpm bench:android` scoring (SPEC-phase4 §9.1, demo/basil-ember-android/PLANTED.md): A1–A10,
// matched like demo/chat's (place and words), with refs as the app's testIDs.
import type { Planted } from './planted';

export const ANDROID_PLANTED: Planted[] = [
  {
    n: 1,
    label: 'A1',
    issue: 'Icon-only header cart button with no label',
    routes: [],
    refs: ['header-cart-button'],
    words: /label|name|screen reader|talkback|announce/,
  },
  {
    n: 2,
    label: 'A2',
    issue: 'Remove is a 36dp target',
    // Tap-target findings merge across screens: the 36dp Remove is the /cart location of one.
    routes: ['/cart'],
    refs: ['cart-remove-*'],
    words: /small|dp|tap target|48/,
  },
  {
    n: 3,
    label: 'A3',
    issue: 'Light grey descriptions under 3:1',
    routes: ['/'],
    refs: ['menu-row-*'],
    words: /hard to read|contrast|grey|gray|faint/,
  },
  {
    n: 4,
    label: 'A4',
    issue: 'No "Added to cart" feedback',
    routes: [],
    // The menu's quick-add gives none either (the same missing feedback, found there first).
    refs: ['item-add', 'quick-add-*'],
    words: /feedback|no sign|nothing (happened|changed|on screen)|confirm|added/,
  },
  {
    n: 5,
    label: 'A5',
    issue: '"Cancel order" with no confirmation',
    routes: ['/order/:id'],
    refs: ['order-cancel'],
    words: /confirm|undo|cancel|ask(s)? first|delete/,
  },
  {
    n: 6,
    label: 'A6',
    issue: '"Add to cart" / "Add to order" / "Start your bag"',
    routes: [],
    refs: ['item-add', 'quick-add-*', 'cart-empty-cta'],
    words: /label|named|wording|inconsistent|same (action|name)|different (words|labels|names)/,
  },
  {
    n: 7,
    label: 'A7',
    issue: 'Two tap targets with identical bounds',
    routes: [],
    refs: ['menu-row-*', 'menu-row-favorite-*'],
    words: /same place|identical|overlap|two tap targets|on top of/,
  },
  {
    n: 8,
    label: 'A8',
    issue: '"Ready around undefined"',
    routes: ['/order/:id'],
    refs: ['order-pickup-line'],
    words: /undefined|placeholder|missing value/,
  },
  {
    n: 9,
    label: 'A9',
    issue: 'Brand drift: the theme ignores the brand the logo, splash and photos carry',
    routes: 'all',
    refs: [],
    words: /brand/,
  },
  {
    n: 10,
    label: 'A10',
    issue: 'Content jumps after load: the special banner pushes the menu',
    routes: ['/'],
    refs: ['menu-special-banner', 'menu-row-*'],
    words: /jump|moved?|shift|push|slid/,
  },
];
