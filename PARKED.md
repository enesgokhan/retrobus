# ⏸ Retrobüs — parked

Paused on 2026-08-11, on purpose. Nothing is broken. **Read this before touching
anything**, because two of the things below look like bugs and are not.

## What "paused" means here

The **Supabase project is paused from the dashboard.** Everything else is
untouched: the repo is public, GitHub Pages is still serving, and the last
commit is deployed.

| | |
|---|---|
| last commit | `ffba587` |
| deployed bundle | `index-B2UowgaK.js` — verified identical to a local build |
| live URL | https://enesgokhan.github.io/retrobus/ |
| database | **paused** |

## Two things that will look broken, and aren't

**1. The site loads and then hangs.** Static assets come from GitHub Pages, so
the page paints; the first call to Supabase never answers, so it sits on a
loading state and eventually raises the connection banner. That is the app
behaving correctly against a database that is switched off. Unpause and it
comes back on its own — there is nothing to redeploy.

**2. Every integration test fails.** `./test/run-all.sh` and everything under
`test/` connects to the real project. While it is paused they all fail, and
they fail in ways that read like data bugs. `npm test` (vitest) and
`npm run build` do not touch the network and stay green — use those to tell
"I broke something" apart from "the database is off".

## To resume

1. Unpause the project in the Supabase dashboard.
2. **Run the three migrations that never landed** — this is the one piece of
   real, unfinished work, and it is the thing most likely to be forgotten:

   ```
   node test/migrations.mjs
   ```

   It reads the live database rather than the files on disk and prints
   APPLIED / NOT APPLIED per migration. As of parking:

   | | |
   |---|---|
   | 0001–0021 | applied |
   | **0022** `revealing_a_stop_reveals_its_poll` | **not applied** |
   | **0023** `health_progress_is_countable` | **not applied** |
   | **0024** `mission_count` | **not applied** |

   Paste those three files from `supabase/migrations/` into the SQL Editor.
   All three are re-runnable, so applying one twice costs nothing.

   Until they are in, three stops report the wrong thing *without erroring* —
   the poll reveal shows the room 0%, the shared screen reads 0/N for the whole
   health check, and the host console says 0 missions next to the button that
   re-rolls them. The code for all three is already written, deployed and
   tested; only the SQL is missing.

3. Put the keep-alive cron back, or the free project pauses itself again in a
   week. In `.github/workflows/deploy.yml`, uncomment:

   ```yaml
   schedule:
     - cron: '17 6 * * 1'
   ```

   It was turned off here on purpose: that job exits 1 and raises a workflow
   error when Supabase does not answer 200, which is right when a pause would
   be a surprise and wrong when the pause is the plan. Leaving it on would have
   mailed a red build every Monday about a thing working as asked.

4. `E2E=1 ./test/run-all.sh` — 30 suites. Expect green once the migrations are
   in; before that, exactly four fail and each names its own migration.

## Nothing is at risk while it sits

- The schema is entirely in `supabase/migrations/`, in git. The data is a
  handful of members and test meetings — reproducible, nothing irreplaceable.
- Free tier, paused: no cost. Public repo: Actions and Pages are free, and with
  the cron off nothing is scheduled to run at all.
- The publishable key in the deployed bundle is public by design — RLS is the
  security model, and with the project paused nothing is reachable anyway.

Worth a glance if this sits for months: Supabase's own policy on how long a
free project may stay paused before it is at risk. If that ever becomes a
concern the answer is a schema + data dump, not un-pausing.

## Still open from before the pause

- The welcome message text has never been written.
- The light/dark toggle only exists in the host's nav, so passengers cannot
  switch. Worth putting in everyone's menu.
- The anonymous sign-in rate limit (Supabase default 30/hour/IP) has not been
  raised. Fine if everyone is on a different network; check before a real night.
- No dry run with real people has happened.
