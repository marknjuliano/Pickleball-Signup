Pickleball Signup v3.7.1 - Per-Tab Visual Builder Hotfix

Hotfixes:
- Fixed a JavaScript typo that could break block insertion.
- Explicitly initializes the selected editor tab/page.
- Updated asset cache-busting version so browsers do not keep stale v3.2 JS/CSS.
- Added a visible load-error fallback instead of a blank page.

# PowerDink Pickleball Signup v3.6

Built directly from the corrected v3.5.1 / v3.4 direct-page-drop branch.

## v3.6 update
- Added a **Backup** tab in Site Editor.
- **Export Site Settings** downloads a versioned JSON backup.
- **Import Site Settings** restores that JSON into the editor draft only.
- Imported settings do **not** go live until the coordinator presses **Publish Changes**.
- Backup includes Site Editor configuration such as branding/logo position, navigation/tab content, labels, Player Page layout, minimum-player/waiting settings, and custom Page Builder blocks.
- Backup intentionally excludes player accounts, events, signups, notifications, and other live database records.
- Preserves the v3.4 direct-on-page smart drop-zone builder and v3.5.1 logo/navigation features.
