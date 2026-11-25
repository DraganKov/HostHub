# Airsoft Hub (HostHub)

A generic, hobby-agnostic community site: feed, groups, messages, reputation (up/down votes), events with registration and prepay tracking, postal-code and distance search, .ics calendar export, field maps with game-mode layers, and finances (admin-only for now).

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

## Area map
The top of the Maps tab is a pan-and-zoom OpenStreetMap of your area (street, topo and satellite layers) with a pin for every published field, store and upcoming event. It centres on the postal code and distance set on the Events tab, "Use my location" recentres it on your device (not saved anywhere), and "Only list what’s on the map" makes the list below follow whatever part of the map you are looking at. It works for guests too. Code is in `areamap.js`.

## Importing listings
Admins can bulk-import fields and stores (CSV, JSON, GeoJSON or KML) from the Maps tab. Listings without coordinates are placed by postal code, duplicates (same name and postal code) are skipped, and each import is credited to a source name.

## Security
- Every table has row-level security. Clients can only change content columns; rep, scores, capacity counts, paid flags, publishing state, verified owner and admin rights are changed only by database functions.
- Two-factor sign-in is enforced by the database for every write once a user turns it on. Posts, comments, messages and groups have per-person rate limits (migration 0010).
- The page ships a Content-Security-Policy (index.html) and pinned, integrity-checked libraries. **Self-hosting:** change `bbrlqxfenmmrffvsgdpr.supabase.co` in the CSP `connect-src` to your own Supabase address, and update an integrity hash whenever you change a library version.
- Third parties the browser contacts: Supabase, the map tile servers (OpenStreetMap, OpenTopoMap, Esri) and zippopotam.us (postal code lookup). They can see a visitor's IP address; none receive account details.
- In the Supabase dashboard (not settable from code): require a minimum password length of 10, turn on leaked-password protection (Pro plan), add CAPTCHA on sign-up, and restrict redirect URLs to your site. Keep the service-role key out of the repo; it is only used by the alert function, along with `CRON_SECRET`.

## Verified accounts
Anyone can browse. To create, change or delete anything (posts, comments, votes, groups, polls, events, registrations, fields, maps, listings, messages, finances), a person must be signed in with a confirmed email or phone number. This is enforced in the database (`supabase/migrations/0015_verified_writes.sql`: an `is_verified()` check as a restrictive policy on every write, and at the start of every write function), not just in the page. Unconfirmed accounts see a banner with a "Resend the email" button. Personal alert settings can still be saved so a phone number can be set up.

## When should I leave?
Event cards and field or store pages have a trip planner for signed-in people. Pick where you start (your saved area, where you are now, or a postal code), how you travel (drive, bike or walk), extra time for traffic and parking, and for events how early you want to arrive. It shows the latest time to set off, the route on a map, a link to OpenStreetMap directions, and a calendar reminder file with an alarm. Routes come from the free OpenStreetMap routing service at routing.openstreetmap.de, which has no live traffic, so there is a cushion setting and a rush-hour warning. Your start point and the destination are sent to that service only when you press the button, and nothing is saved. Code is in `commute.js`.

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

## Directory
The Directory tab shows every field and store as a card grid, closest first once you set your area (postal or ZIP code, or "Use my location"; the same saved area the Events tab uses). Each card has a colour tile with the distance, badges, a short description and links. Without a saved area it falls back to A to Z and offers a "Show what’s closest to me" button. Filters cover outdoor, indoor, stores and province, plus search. Anyone can browse. Signed-in, verified members can add a listing (fields start as drafts until the playing area is drawn; stores go live straight away), edit their own and delete them. Admins can edit or delete any listing. Links are only shown if they are plain `http(s)` addresses. The Partners tab shows active partners as cards in the same grid; admins add, edit, hide, reorder and delete them. Partners show an initial tile, never an externally hosted logo. Database changes are in `supabase/migrations/0014_directory.sql`.

## Finances (admin-only for now)
The Finances page is hidden from everyone except site admins: no menu tab, and anyone else who opens the link sees "only available to site admins". This is enforced in the database too (`supabase/migrations/0016_finances_admin_only.sql` replaces the member read policy on `ledger` with an admin-only one), so members cannot read the ledger through the API either. To make it public to signed-in members again, remove `admin:true` from the `registerView("finances", ...)` call in `finance.js` and restore the policy as described at the top of that migration.
