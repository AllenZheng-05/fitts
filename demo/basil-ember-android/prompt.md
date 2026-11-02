# Generated from this prompt

Build, in one pass, a complete Expo (React Native) ordering app for "Basil & Ember", a fictional wood-fired pizza restaurant, in the NEW folder C:\Users\Plasm\Projects\fitts\demo\basil-ember-android. It is the Android twin of the existing website at C:\Users\Plasm\Projects\fitts\demo\basil-ember (read it first: src/index.css for colors and fonts, src/data/menu.ts for the menu items, sizes, toppings and prices, src/lib/pricing.ts for tax, src/components/Layout.tsx and pages for the address, hours, copy and tone). Match its branding exactly: the name, colors (as hex values from index.css's custom properties), fonts (Fraunces for display and DM Sans for body, loaded with expo-font / @expo-google-fonts packages), menu items, prices, address and voice. It must look and feel like a believable real restaurant app, not a demo.

Hard rules:
- Write files ONLY inside demo/basil-ember-android. Do not modify any other file in the repo. Do not run git. Do not run npm/pnpm install or any network command; just write the files.
- Stack: same versions as the working smoke app at C:\Users\Plasm\code\expo-smoke (read its package.json and app.json and copy its versions: expo ~58.0.22, react 19.3.0, react-native 0.88.1, and the matching expo-router and other expo-* versions). Use Expo Router (app/ directory), TypeScript strict, and a development build with expo-dev-client (add it to dependencies). In app.json, set android.package to "com.basilandember.order", the name to "Basil & Ember", the slug to "basil-ember-android", and the scheme to "basilember". No backend: the menu comes from a local data file, and the cart and orders are in React context with mock timers for order status.
- package.json name: "basil-ember-android", private, with scripts "start": "expo start --dev-client", "android": "expo run:android" and "typecheck": "tsc --noEmit". Add a tsconfig.json that extends expo/tsconfig.base with strict on.
- Screens (Expo Router):
  - Menu (the home tab): categories and items with prices and short descriptions.
  - Item detail: size choice and toppings with live price, quantity, and an add button.
  - Cart: lines with quantity −/+ and Remove, subtotal, tax at the site's rate, and total.
  - Pickup checkout: name, phone and pickup time; pay at the counter, like the site.
  - Order status: received → in the oven → ready for pickup, on timers, with a "Cancel order" action.
  - A cart button in the header showing the item count.
- Every interactive element gets a testID and a proper accessibilityLabel/accessibilityRole, EXCEPT where a planted issue below says otherwise.

Plant exactly these 8 everyday problems that real apps ship, subtly and naturally (no comments in code pointing at them):
- A1: The header cart button is icon-only (a bag or cart icon drawn with Views or @expo/vector-icons, plus a count badge) with no accessibilityLabel and no text. Keep its testID.
- A2: The cart line's Remove button (or the quantity −/+ buttons) is a 36×36 dp touch target with no hitSlop.
- A3: Low-contrast secondary text: item descriptions (or the secondary price text) on the menu use a light grey like #B8AFA3 on the cream background, under 3:1 contrast.
- A4: No "Added to cart" feedback: tapping the add button on Item detail silently adds the item. No toast, no navigation and no badge animation (the badge count does change, but it's in the header and easy to miss).
- A5: "Cancel order" on Order status cancels immediately, with no confirmation dialog. It performs a destructive action: it calls a function that "DELETEs" the order (a fetch with method DELETE to http://localhost:8787/orders/<id> inside a try/catch that ignores failure, then clears local state), so a network gate sees a write.
- A6: Inconsistent labels for one action: Item detail says "Add to cart"; the quick-add button on menu rows says "Add to order"; the empty cart says "Start your bag".
- A7: Two clickable elements with identical bounds: on menu rows, the whole row is a Pressable to the item AND an absolutely-positioned full-size Pressable overlay (e.g. a "favorite" long-press target) sits exactly on top of it with the same bounds.
- A8: A placeholder leak in on-screen text: on Order status, the pickup line reads "Ready around undefined" when the customer picked "As soon as possible" (the ASAP path never sets a time string).

Also write:
- PLANTED.md: the answer key, a table of # | Planted issue | Screen | Element (testID or text) | Detected by, using these detectors: A1 android-label probe; A2 android-target probe (48 dp minimum); A3 android-contrast (pixels); A4 trace + reviewers; A5 the network gate (a DELETE write) + reviewers; A6 label-consistency; A7 android-duplicate-bounds probe; A8 placeholder-leak on hierarchy text. Add one line per issue saying exactly where in the code it lives (file:line).
- README.md: a short product-style README (what the app is), plus how to run it: `npx expo run:android` once to build the dev client on the emulator, then `npx expo start --dev-client`.
- prompt.md: this prompt, verbatim, under the heading "Generated from this prompt".
- .gitignore suited to Expo (node_modules, .expo, android/, ios/, dist).

Keep the code clean, idiomatic and typed, so it would pass `tsc --noEmit` once installed. When done, reply with the file list, one line per planted issue with its file:line, and anything you were unsure about.
