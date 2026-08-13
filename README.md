# Pickleball Signup v3.7.4

Hotfix for the v3.7 per-tab visual builder. Fixes a malformed `renderCalendar()` block that caused the browser startup error `Unexpected end of input`. Built from the user's uploaded v3.7.3 diagnostic package and retains the v3.7 per-tab builder plus v3.6 backup/import-export features.

# Pickleball Signup v3.7.2 — Load Recovery Hotfix

Built from v3.7.1. Adds defensive startup/render recovery and uniquely named CSS/JS assets to prevent stale browser/CDN cache from keeping the broken build. Retains v3.7 per-tab visual builder and v3.6 Site Settings backup/import.


## v3.7.6
Added shareable public event links. Guests can view a linked event without creating a username; Interested/Playing requires login or account creation, then returns to the same event. Coordinator event cards include Copy Event Link.

### Firebase requirement for public event links
This build uses Firebase Anonymous Authentication for view-only event guests so existing authenticated-read Firestore rules can remain protected. In Firebase Console, enable **Authentication → Sign-in method → Anonymous**. Guest sessions only render the linked event and do not expose coordinator controls. Signup still requires a regular username/password account.
