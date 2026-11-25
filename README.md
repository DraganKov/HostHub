# Airsoft Hub (HostHub)

A generic, hobby-agnostic community site: feed, groups, messages, reputation (up/down votes), events with registration and prepay tracking, postal-code and distance search, .ics calendar export, field maps with game-mode layers, and public finances.

Built entirely on open source: Supabase (Postgres, Auth, Realtime), Leaflet and Leaflet.draw, OpenStreetMap, Esri imagery tiles, zippopotam.us (postal geocoding), RFC 5545 iCalendar. No build step: static files.

## Run it
1. Create a Supabase project (hosted, or self-hosted with the official docker setup: https://supabase.com/docs/guides/self-hosting/docker).
2. Run the files in `supabase/migrations` in order. (0001 to 0003, the original schema, still need to be exported into this folder.)
3. Put your project URL and anon key in `config.js`.
4. Serve the folder from any static host: GitHub Pages, or a field owner's own machine (`python3 -m http.server`).

## Maps
Field owners draw the playing area and any number of game-mode layers: zones, out-of-bounds areas, routes, phase lines, range rings, objectives, spawns and NATO-style unit symbols (milsymbol). Viewers get street, topo and satellite basemaps, a measure tool, live lat/lng and MGRS (mgrs) readout, find-me, full screen, and KML/GeoJSON export. KML opens in ATAK and Google Earth; owners can import KML or GeoJSON.

## Polls
Any member can build a poll: 2 to 10 choices, single or multiple choice (with a cap), optional close time (up to 90 days), optional member-added choices, and a results rule (always, after voting, or after closing) that the database enforces. A live preview shows what voters will see. Authors can close or delete their polls. Run migration 0011 first.

## Importing listings
Admins can bulk-import fields and stores (CSV, JSON, GeoJSON or KML) from the Maps tab. Listings without coordinates are placed by postal code, duplicates (same name and postal code) are skipped, and each import is credited to a source name.

## Security
- Every table has row-level security. Clients can only change content columns; rep, scores, capacity counts, paid flags, publishing state, verified owner and admin rights are changed only by database functions.
- Two-factor sign-in is enforced by the database for every write once a user turns it on. Posts, comments, messages and groups have per-person rate limits (migration 0010).
- The page ships a Content-Security-Policy (index.html) and pinned, integrity-checked libraries. **Self-hosting:** change `bbrlqxfenmmrffvsgdpr.supabase.co` in the CSP `connect-src` to your own Supabase address, and update an integrity hash whenever you change a library version.
- Third parties the browser contacts: Supabase, the map tile servers (OpenStreetMap, OpenTopoMap, Esri) and zippopotam.us (postal code lookup). They can see a visitor's IP address; none receive account details.
- In the Supabase dashboard (not settable from code): require a minimum password length of 10, turn on leaked-password protection (Pro plan), add CAPTCHA on sign-up, and restrict redirect URLs to your site. Keep the service-role key out of the repo; it is only used by the alert function, along with `CRON_SECRET`.

## Privacy
Usernames only. Email, phone and home postal code are private to the account. Alert settings are visible only to their owner.

## Still to configure
- OAuth providers (Supabase dashboard), then list them in `OAUTH` in `config.js`; set the Site URL.
- Email/SMS alerts: deploy `supabase/functions/notify-upcoming-events` (scaffold, untested) with Resend/Twilio secrets.
- Payments: prepay is tracking only; hosts mark attendees paid after e-transfer or similar. No payment processor is wired in.
- Geocoding covers Canadian and US postal codes only.

## Events, registration, rules and event maps

- **Hosting:** create, edit, duplicate, cancel, reopen and delete events. Location and field are fixed once an event exists. Everyone registered or waitlisted is notified when the time, place or title changes, or the event is cancelled or reopened.
- **Registration:** choose a group size (1 to 10) and add a note. When an event is full, people join a waitlist. They move up automatically, oldest first, when a spot opens or the host raises the capacity. People can edit or cancel their registration.
- **Host tools:** attendee list with group size and notes, paid and check-in toggles, waitlist, remove, and a CSV export with usernames only.
- **Rules:** start from a template (open play, milsim, CQB, new players) or write your own. Every rule can carry a quiz question.
- **Rules check (optional):** when the host turns it on, each person answers 3 randomly picked multiple-choice questions before they can register or join the waitlist. Answers are graded in the database (`get_event_quiz`, `submit_event_quiz`) and never reach the browser. Every try gets new questions, and tries are limited per hour.
- **Event map:** the field's playing area and the event's game-mode map on OpenStreetMap, with KML export for ATAK and Google Earth, GeoJSON export, and directions on OpenStreetMap.
- Migrations `0012_events_registrations_crud.sql` and `0013_rules_and_quiz.sql`.
