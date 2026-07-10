# Pickleball Signup v2.5.3 — Runtime Fix

Fixed the startup error caused by using the `today()` helper before it was initialized.


Built from the last working Firebase-connected v2.4.2 files.

## Included
- Player tab shows only the current/nearest upcoming event and one next event.
- Past events are hidden from players.
- Calendar tab uses a real monthly calendar.
- Clicking a date shows event information below the calendar.
- Coordinator upcoming/current and past events are separated and collapsible.
- Past events keep Edit, Delete, and Export actions.
- Firebase Authentication and Firestore configuration are unchanged.
- Added cache-busting and visible `v2.5.2` footer marker.

## Upload
Upload the CONTENTS of this folder to the repository root. Replace `index.html`, `css`, `js`, `images`, and `README.md`.