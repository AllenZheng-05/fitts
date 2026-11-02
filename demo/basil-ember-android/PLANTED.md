# Planted issues (answer key)

| # | Planted issue | Screen | Element (testID or text) | Detected by |
|---|---|---|---|---|
| A1 | Icon-only header cart button with a count badge, no accessibilityLabel and no text | Every screen with a header | `header-cart-button` | android-label probe |
| A2 | Cart line Remove button is a 36x36 dp touch target with no hitSlop | Cart | `cart-remove-<itemId>` (trash icon) | android-target probe (48 dp minimum) |
| A3 | Item descriptions in light grey #B8AFA3 on the cream card, under 3:1 contrast | Menu | description text under each `menu-row-<itemId>` | android-contrast (pixels) |
| A4 | Adding an item gives no feedback: no toast, no navigation, no badge animation | Item detail | `item-add` ("Add to cart") | trace + reviewers |
| A5 | "Cancel order" cancels at once with no confirmation, and sends `DELETE http://localhost:8787/orders/<id>` | Order status | `order-cancel` ("Cancel order") | the network gate (a DELETE write) + reviewers |
| A6 | One action, three labels: "Add to cart" (item detail), "Add to order" (menu quick-add), "Start your bag" (empty cart) | Item detail, Menu, Cart | `item-add`, `quick-add-<itemId>`, `cart-empty-cta` | label-consistency |
| A7 | Two clickable elements with identical bounds: the row Pressable and a full-size overlay Pressable (favorite long-press) | Menu | `menu-row-<itemId>` and `menu-row-favorite-<itemId>` | android-duplicate-bounds probe |
| A8 | Placeholder leak: "Ready around undefined" when pickup is "As soon as possible" | Order status | `order-pickup-line` | placeholder-leak on hierarchy text |
| A9 | Brand drift: the in-app theme ignores the brand that the logo, splash and photos carry (stock Material 3 colors and the system font everywhere, while the wordmark, splash and menu stay Basil & Ember) | Every screen | `src/lib/theme.ts` (every color and font token); the header wordmark (`header-wordmark`) stays on brand | the theme check (check_theme on the phone screenshots) and the reviewers · severity 2 |
| A10 | Content jumps after load: a "Tonight's special" banner appears about 1.2 s after Menu opens, above the list with no reserved space, so every row moves down about 96 dp and a tap meant for one pizza lands on another | Menu (every visit) | `menu-special-banner`; the rows below it (`menu-row-<itemId>`) jump | the Android surprise check (jumped) plus the Wonder judge · severity 2 |

## Where each lives

- A1: `src/components/CartButton.tsx:11` (the Pressable has a testID and no label; icon on line 12, badge on lines 13-17)
- A2: `app/(tabs)/cart.tsx:54-61` (the Pressable; no hitSlop) with the 36x36 size in `app/(tabs)/cart.tsx:111-114`
- A3: `src/components/MenuRow.tsx:73` (`desc` style, color `#B8AFA3`)
- A4: `app/item/[id].tsx:91` (`onPress` calls `addItem` and does nothing else)
- A5: `app/order/[id].tsx:77-82` (no confirmation), `src/state/store.tsx:111-116` (`cancelOrder`) and `src/lib/api.ts:5` (the DELETE fetch inside a try/catch that ignores failure)
- A6: `app/item/[id].tsx:90,94` ("Add to cart"), `src/components/MenuRow.tsx:50,54` ("Add to order"), `app/(tabs)/cart.tsx:22` ("Start your bag")
- A7: `src/components/MenuRow.tsx:16-24` (row Pressable) and `src/components/MenuRow.tsx:34-41` (absolute-fill overlay Pressable, same bounds)
- A10: `app/(tabs)/index.tsx` (the `special` state set by a 1.2 s timer on each focus, and the banner in the list header with no space reserved).
- A9: `src/lib/theme.ts` (all tokens set to the Material 3 baseline and `sans-serif`). The wordmark
  (`src/components/Wordmark.tsx`, used as the Menu tab's header title) and the splash
  (`app.json`) carry the brand's own colors and Fraunces, so the mismatch shows.
- A8: `app/order/[id].tsx:38` (the template line) with `src/state/store.tsx:93` (ASAP leaves `pickupTime` undefined)

## A9's answer key: the brand tokens before the drift

The fix restores these in `src/lib/theme.ts` (the bench checks the colors are close and the font
families the same):

| Token | Brand value | Planted (stock) value |
|---|---|---|
| ink | #1c1611 | #1D1B20 |
| ink2 | #2a211a | #49454F |
| ember | #bc4622 | #6750A4 |
| emberDark | #9a3718 | #4F378B |
| basil | #2f5233 | #625B71 |
| gold | #b98d4f | #7D5260 |
| stone | #f2ede3 | #FEF7FF |
| line | #e3dacb | #CAC4D0 |
| muted | #6f6355 | #79747E |
| card | #fffcf6 | #F7F2FA |
| cream | #f5efe4 | #F3EDF7 |
| white | #ffffff | #ffffff |

| Font token | Brand value | Planted (stock) value |
|---|---|---|
| display | Fraunces_600SemiBold | sans-serif |
| displayBold | Fraunces_700Bold | sans-serif |
| body | DMSans_400Regular | sans-serif |
| bodyMedium | DMSans_500Medium | sans-serif |
| bodyBold | DMSans_700Bold | sans-serif |

A3 stays detectable either way: its hard-coded #B8AFA3 description text is 2.11:1 on the brand
card (#fffcf6) and 1.96:1 on the stock card (#F7F2FA), under 3:1 both before and after the fix.
