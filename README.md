# Pickleball Signup v3.1 — Visual Page Builder

Built from the working v3.0 Firebase-connected PowerDink app.

## New in v3.1
- Weebly-style **Visual Site Editor** for Coordinators.
- **Branding editor** for logo, header background, dark overlay, app title, notification bell, and accent color.
- Use built-in image paths, paste image URLs, or choose a small image file (kept under 180 KB for Firestore safety).
- **Add Block** system for Heading, Text, Announcement, Image, Button, and Divider blocks.
- Reorder blocks with Up/Down controls, Hide/Show, Edit, and Delete.
- Desktop and Mobile live preview.
- Save Draft, Discard, Reset, and Publish Changes workflow.
- Published blocks appear on the Player page above the featured event.
- Existing Firebase Authentication, Firestore events, signups, notifications, calendar, usernames, and coordinator tools are preserved.

## Firestore
The editor reads/writes:
- `siteSettings/published`
- `siteSettings/draft`

Your Firestore rules must allow coordinators/admins to write these documents.

## Upload
Upload the **contents** of this ZIP to the root of the existing GitHub repository, replacing `index.html`, `css`, `js`, `images`, and `README.md`.
