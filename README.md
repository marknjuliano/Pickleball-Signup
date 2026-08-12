# Pickleball Signup v3.0 — Admin Site Editor

Firebase-connected GitHub Pages app.

## New in v3.0
- Coordinator-only **Site Editor** with a live preview.
- Desktop and Mobile preview modes.
- Draft workflow: edit, preview, Save Draft, Discard, Reset, then Publish Changes.
- Published settings are saved in Firestore at `siteSettings/published`.
- Draft settings are saved separately at `siteSettings/draft`.
- Editable app title, Player page heading/subtitle, section labels, button labels, accent color, and visibility toggles.
- Existing Firebase Authentication, username/email login, events, signups, notifications, calendar, profile, and coordinator tools are preserved.

## Firestore
The app will create/use two documents in the `siteSettings` collection:
- `published` — live site settings
- `draft` — unpublished editor draft

Your Firestore rules must allow coordinators/admins to write these documents and logged-in users to read `published`.

## Upload
Upload the CONTENTS of this folder to the root of the existing GitHub repository and replace the current files.
