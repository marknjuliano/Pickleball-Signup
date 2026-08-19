# Pickleball Signup v3.7.8 — Coordinator Activity Dashboard

Built directly from v3.7.7.

Adds Coordinator > Activity with filters for Today / 7 Days / 30 Days / All:
- Public event views
- Approximate unique visitors (random browser ID; no guest name/email)
- New user/account creation
- New signup and signup-status changes
- Recent activity timeline with event/location and timestamp

The dashboard begins tracking new activity after this build is deployed. Historical guest views cannot be reconstructed.

IMPORTANT: Public view tracking needs the Firestore rules in `FIRESTORE-PUBLIC-EVENT-RULES.txt`. Publish those rules in Firebase Console.


## v3.7.10
Event status wording is now editable in Site Editor > Labels, including Cancelled/Canceled, Court Booked, Closed for Renovation, Closed for Event, Fully Booked, and Waiting. These labels are included in Site Settings export/import.
