# Airsoft Hub (HostHub)

A generic, hobby-agnostic community site: feed, groups, messages, reputation (up/down votes), events with registration and prepay tracking, postal-code and distance search, .ics calendar export, field maps with game-mode layers, and public finances.

Built entirely on open source: Supabase (Postgres, Auth, Realtime), Leaflet and Leaflet.draw, OpenStreetMap, Esri imagery tiles, zippopotam.us (postal geocoding), RFC 5545 iCalendar. No build step: static files.

## Run it
1. Create a Supabase project (hosted, or self-hosted with the official docker setup: https://supabase.com/docs/guides/self-hosting/docker).
2. Run the files in `supabase/migrations` in order. (0001 to 0003, the original schema, still need to be exported into this folder.)
3. Put your project URL and anon key in `config.js`.
4. Serve the folder from any static host: GitHub Pages, or a field owner's own machine (`python3 -m http.server`).

## Privacy
Usernames only. Email, phone and home postal code are private to the account. Alert settings are visible only to their owner.

## Still to configure
- OAuth providers (Supabase dashboard), then list them in `OAUTH` in `config.js`; set the Site URL.
- Email/SMS alerts: deploy `supabase/functions/notify-upcoming-events` (scaffold, untested) with Resend/Twilio secrets.
- Payments: prepay is tracking only; hosts mark attendees paid after e-transfer or similar. No payment processor is wired in.
- Geocoding covers Canadian and US postal codes only.
