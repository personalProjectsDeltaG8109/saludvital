# Issue 248 — Remove Patient Dashboard Profile Summary

- Removed the personal-details profile card from the patient dashboard home while preserving the dedicated `/patient/profile` route and shared navigation links.
- Kept the signed-in patient's name and photo in the shared header. The dashboard query now selects only the patient ID needed for appointment and notification lookups; the header continues using its existing minimal identity query.
- Removed the dashboard-only profile-photo dialog, its event handlers, and CSS rules that became unreachable. Profile-page photo behavior remains unchanged.
- Adjusted the dashboard's notification column to use the available layout space after removal of the second card.
- Added a rendered-view test and expanded the patient dashboard browser check for profile navigation and horizontal overflow at mobile, 760–768px, tablet, and desktop widths.
- No user story acceptance criteria, schema, dependencies, stored profile data, or profile functionality changed.
