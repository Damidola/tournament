# Public tournament service

Hosted at https://tournament-live.nutmegmoth1.chatgpt.site with Sites and R2.

`worker.js` matches the deployed Worker source. `hosting.json` records the deployment identity and BUCKET binding. The Sites source checkout is `/workspace/sites/tournament-live`.

The main application stays on GitHub Pages. Parents open `/t/<random-id>` without authentication. They see pairings for all published rounds and current standings. The viewer refreshes every 15 seconds; an organizer's edits upload automatically while the application is online. Local scoring works offline and retries publication when connected.

Public JSON contains names, pairings, results and standings. It never contains profile ratings, contact fields, birth dates, history snapshots or organizer write keys. Each tournament uses its own random write capability; only its SHA-256 hash is stored by the service. Private cloud backups require their access code for both reading and writing.
