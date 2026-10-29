# demo/chat — planted issues (benchmark answer key)

The 25 usability problems planted in this app. `pnpm bench:chat` scores a Fitts run's findings
against this list (recall and precision). `scripts/check-demo-chat.cjs` checks that each one
still reproduces.

Each row lists where the issue is and the `data-ref` (or route) a finding should point at.

| #   | Planted issue                                        | Where                                                                            | Ref / route                                      | Detected by                    |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| 1   | Recipient shows "(null)" on step 2                   | `src/pages/Compose.tsx` (`ComposeRecipient`) reads the wrong session key         | `compose-to` · `/compose/recipient`              | placeholder-leak probe · H2/H9 |
| 2   | One action labeled NEXT / Send Text / Create Message | Compose steps 1–3                                                                | `compose-next`, `compose-create`, `compose-send` | label-consistency probe · H4   |
| 3   | No confirmation after sending                        | `ComposeConfirm` navigates to `/` silently                                       | `compose-send` · `/compose/confirm`              | feedback-timing probe · H1     |
| 4   | Browser back on step 2 loses the draft               | Step 1 and step 2 keep their state locally                                       | `/compose/recipient`                             | back-mid-flow trace · H3       |
| 5   | No back/cancel control in compose                    | Compose steps 1–3                                                                | `/compose`                                       | trace + reviewers · H3         |
| 6   | Recipient chosen on step 1 not shown on step 2       | Same bug as #1, seen as recognition                                              | `compose-to`                                     | reviewers · H6                 |
| 7   | Send target 28×20px                                  | `.send-link`                                                                     | `compose-send`                                   | target-size probe · Fitts ID   |
| 8   | Placeholder text contrast about 2.6:1                | `.body::placeholder` (#a1a1a1)                                                   | `compose-body`                                   | contrast probe                 |
| 9   | Timestamp text #BBB on white                         | `.stamp`                                                                         | `/`                                              | axe color-contrast             |
| 10  | Search sends a request on every keystroke            | `src/pages/Search.tsx`                                                           | `search-input`                                   | network probe (no debounce)    |
| 11  | Repeat search re-fetches, no cache headers           | `server/api.ts` `/api/search`                                                    | `/search`                                        | network probe (no cache)       |
| 12  | Search returns 20,000 items, no pagination           | `server/api.ts` `/api/search` (about 1.9 MB)                                     | `/search`                                        | payload probe · H8             |
| 13  | No loading indicator during the 1.5s search          | `Search.tsx`                                                                     | `search-input`                                   | feedback-timing · H1           |
| 14  | Empty send shows "Error 0x3F"                        | `/api/messages` 400 shown raw                                                    | `compose-send`                                   | error-message probe · H9       |
| 15  | Validation error clears the whole form               | `src/pages/Contacts.tsx` add-contact form                                        | `contacts-add`                                   | trace · H5/H3                  |
| 16  | "Delete conversation" deletes instantly              | `src/pages/Thread.tsx` → `DELETE /api/conversations/12`                          | `thread-delete`                                  | gate + trace · H5              |
| 17  | Icon-only buttons with no accessible name            | Call and video buttons on the thread                                             | `thread-call`, `thread-video`                    | axe button-name                |
| 18  | Three date formats across screens                    | Inbox `10/27/26`, thread `Oct 27, 2:14 PM`, search `2026-10-27` (`src/dates.ts`) | `/`, `/contacts/grandma`, `/search`              | reviewers · H4                 |
| 19  | Three font families                                  | Georgia titles, system-ui body, Trebuchet buttons                                | all                                              | font-inventory probe · H4/H8   |
| 20  | Off-grid, inconsistent padding                       | 22, 7, 13, 11, 9, 5 and 3px across `styles.css`                                  | all                                              | spacing probe · H8             |
| 21  | Settings has 14 ungrouped toggles                    | `src/pages/Settings.tsx`                                                         | `settings-list`                                  | reviewers · H8 / Hick          |
| 22  | Jargon "Initialize thread"                           | Thread page button                                                               | `thread-message`                                 | content lens · H2              |
| 23  | Focus outline removed globally                       | `*:focus { outline: none }`                                                      | all                                              | focus-visible probe · a11y     |
| 24  | Help link returns 404                                | Inbox footer link `/help`                                                        | `inbox-help`                                     | link probe · H10               |
| 25  | Contacts page has no empty state                     | A filter with no match shows nothing                                             | `contacts-list`                                  | reviewers · H1/H10             |

## Scoring rules for `pnpm bench:chat`

- A finding matches a planted issue when its route or ref matches the row **and** its title or
  evidence names the same problem. One finding can match only one issue, and one issue counts
  once.
- **Recall** is matched issues out of 25.
- **Precision** counts shown findings at severity 2 or higher that match no planted issue as
  false positives. The P6 bar is at most 2 false positives.
