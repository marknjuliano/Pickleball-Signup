# Pickleball Signup v2.7.4 — Reusable Court Message Presets

Built from the uploaded Firebase-connected v2.7.3 project.

## New in v2.7.4
- The hard-coded "Minimum 6 playing players before booking court" text is now editable per event.
- Coordinator event form now has a **Court Reservation Message** dropdown with reusable built-in messages.
- Selecting a preset automatically fills the message textarea; the coordinator may customize it for that event.
- Added **Manage Court Message Presets** so coordinators can save, edit, and delete their own reusable messages.
- Custom presets are stored in Firestore collection `messagePresets`, so they can be reused from other devices.
- Existing events without a saved reservation message automatically use the new default message.
- Firebase configuration, Authentication, existing events, signups, notifications, calendar, and player features are preserved.

## Upload
Upload the CONTENTS of this folder to the root of the existing GitHub repository and replace the current files.

If Firestore security rules are restrictive, allow coordinator/admin access to the `messagePresets` collection before saving custom presets.
