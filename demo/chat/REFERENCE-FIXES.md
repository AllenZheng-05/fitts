# demo/chat — reference fixes

What good fixes look like, from the Phase 1 mock's `fixed` variant. These are kept as notes,
not code, so Fitts has real work to do. Use them to judge a fix, never to apply one.

## Compose flow (#1–#7, #14)

- Step 2 and step 3 show the chosen contact: "To: Grandma". Read the same session key that
  step 1 writes, and fall back to a "Choose who it's for" prompt rather than "(null)".
- One name per action: "Next" on steps 1 and 2, and "Send" on step 3. Remove the extra "Create
  Message" link.
- Every step has a "Back" button (outline style) on the left. Step 1's Back returns to the inbox.
- The draft (recipient and text) survives browser back and forward. Keep it in one place, such
  as `sessionStorage` or a context, written on change.
- "Send" is a real button about 44px tall (padding 13px 28px), primary color #1F2A88, white
  text.
- After sending, stay on the confirm step and show "Sent to Grandma ✓" in a `role="status"`
  box (green tint #E6F6EE, text #0B5A3E), with a link back to Messages.
- An empty message disables Send, or says "Write a message first" next to the field. Never
  "Error 0x3F".
- The fixed layout is a little larger: card max width 360px, body text 17px, a 46px To field.

## Search (#10–#13)

- Debounce input by about 300ms, and cancel stale requests.
- Show a spinner (`role="status"`, "Searching…") while waiting.
- Show "No messages match "{query}"." when nothing matches.
- The server filters by `q`, returns at most 50 results with a cursor, and sends
  `Cache-Control: max-age=30`.

## Everything else

- **Contrast (#8, #9):** placeholder #6B6B66 or darker; timestamps #6B6B66.
- **Delete (#16):** "Delete conversation" asks first ("Delete your conversation with Grandma?"
  with Cancel / Delete), or offers Undo for 10 seconds.
- **Accessible names (#17):** the call and video icon buttons get `aria-label="Call Grandma"`
  and `aria-label="Video call Grandma"`.
- **Dates (#18):** one date format everywhere, for example "Oct 27" plus a time on the
  thread.
- **Fonts (#19):** one family (system-ui) for titles, body and buttons.
- **Spacing (#20):** spacing on a 4px grid (8, 12, 16, 24).
- **Settings (#21):** toggles grouped under 3–4 headings (Notifications, Media, Chats,
  Display).
- **Wording (#22):** "Initialize thread" becomes "New message".
- **Focus (#23):** delete the global `outline: none`, and give focusable elements a visible
  2px focus ring.
- **Help (#24):** the Help link goes to a real help page, or is removed.
- **Empty state (#25):** with no matches, the contacts filter shows "No contacts match
  "{query}"." plus an "Add a contact" link.
- **Add contact (#15):** a validation error keeps what the user typed and says what's wrong
  ("Phone numbers use digits only") next to the field, with `aria-invalid`.
