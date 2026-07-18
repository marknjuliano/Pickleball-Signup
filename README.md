# Pickleball Signup v2.6.1 — Username + Recovery Email

Firebase-connected GitHub Pages app.

## Included
- Separate Login and Create Account tabs.
- New accounts use a required username and display name.
- Optional recovery email supports Firebase password reset.
- Existing email/password accounts continue to work.
- Username login resolves through the Firestore `usernames` collection.
- Notification panel no longer clips inside the header.
- All v2.5.4 player, calendar, coordinator, and notification features remain.

## Important Firestore access
The app creates `usernames/{usernameLower}` mapping documents. Username login requires those mapping documents to be readable before login.

## Upload
Upload the CONTENTS of this folder to the repository root and replace `index.html`, `css`, `js`, `images`, and `README.md`.
