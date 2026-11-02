# Issue 245 — Patient Dashboard Notification Channel Icons

- Reused the existing WhatsApp brand asset and the inline SVG conventions already used on the patient notification settings page.
- Added separate decorative icons for WhatsApp, SMS, and email to the dashboard preference rows. Accessible Spanish labels and switch names remain unchanged.
- Kept the existing persisted preference data and channel update endpoint unchanged.
- Added a Pug rendering test for the three icon mappings and accessible switch labels.
- The preference service continues to require at least one enabled channel. US-ADM-51 criterion 9 now states that verification or availability is claimed only when the existing application has a reliable signal; it does not invent a contact-verification flow.
- No database or dependency changes were required.
