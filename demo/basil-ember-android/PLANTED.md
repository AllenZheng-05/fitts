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

## Where each lives

- A1: `src/components/CartButton.tsx:11` (the Pressable has a testID and no label; icon on line 12, badge on lines 13-17)
- A2: `app/(tabs)/cart.tsx:54-61` (the Pressable; no hitSlop) with the 36x36 size in `app/(tabs)/cart.tsx:111-114`
- A3: `src/components/MenuRow.tsx:73` (`desc` style, color `#B8AFA3`)
- A4: `app/item/[id].tsx:91` (`onPress` calls `addItem` and does nothing else)
- A5: `app/order/[id].tsx:77-82` (no confirmation), `src/state/store.tsx:111-116` (`cancelOrder`) and `src/lib/api.ts:5` (the DELETE fetch inside a try/catch that ignores failure)
- A6: `app/item/[id].tsx:90,94` ("Add to cart"), `src/components/MenuRow.tsx:50,54` ("Add to order"), `app/(tabs)/cart.tsx:22` ("Start your bag")
- A7: `src/components/MenuRow.tsx:16-24` (row Pressable) and `src/components/MenuRow.tsx:34-41` (absolute-fill overlay Pressable, same bounds)
- A8: `app/order/[id].tsx:38` (the template line) with `src/state/store.tsx:93` (ASAP leaves `pickupTime` undefined)
