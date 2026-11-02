# Basil & Ember — pickup ordering for Android

Order wood-fired pizza from Basil & Ember (128 Fournier Street, Maplewood, OH) and skip the line.
Browse the menu, build your pie with a size and toppings, check out with a name, phone and pickup
time, and follow your order from received to in the oven to ready for pickup. Payment happens at
the counter.

Open Tue-Thu 4pm-10pm, Fri-Sat 12pm-11pm, Sun 12pm-9pm. Closed Monday. (513) 555-0148.

This is the Android twin of the `basil-ember` website: the same menu, prices, 8.5% tax and voice.
There is no backend. The menu is a local data file, and the cart and orders live in React context,
with timers moving an order through its stages.

## Run it

Needs the Android SDK and an emulator (or device) running.

```
npm install
npx expo run:android      # once: builds the development client onto the emulator
npx expo start --dev-client
```

After the first build, `npx expo start --dev-client` is all you need. Type-check with `npm run typecheck`.

Built with Expo SDK 58, Expo Router, React Native 0.88 and TypeScript. Fonts: Fraunces and DM Sans.
