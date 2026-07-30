-- Retrobüs 0009 — publish `participation` for realtime.
--
-- THE BUG THIS FIXES, because it is worth understanding rather than just
-- patching: a postgres_changes binding on a table that is not in the
-- supabase_realtime publication does not merely fail on its own — it silently
-- kills EVERY OTHER binding on the same channel. The channel still reports
-- SUBSCRIBED, so from the client there is no sign anything is wrong.
--
-- HealthCheckStage and RankStage both subscribed to ['<their table>',
-- 'participation']. `participation` was never published, so both stages
-- received no live updates at all and only showed data after a page reload.
-- That is the "data not loading until refresh" report.
--
-- Verified before/after: a channel bound to ['meetings'] receives the update,
-- the same channel bound to ['meetings','participation'] receives nothing.
--
-- Guard against a repeat: test/publication-test.mjs now asserts that every
-- table the client subscribes to is actually in the publication.

alter publication supabase_realtime add table public.participation;
