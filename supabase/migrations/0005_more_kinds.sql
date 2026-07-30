-- Retrobüs 0005 — register the stage kinds added after 0001.
-- Kept as its own migration so the constraint change is easy to audit.

alter table public.stages drop constraint stages_kind_check;
alter table public.stages add constraint stages_kind_check check (
  kind in (
    'wordcloud', 'two_truths', 'health_check', 'lean_coffee', 'board', 'poll',
    'feedback_wall', 'suggestions', 'quiz', 'codenames', 'wavelength',
    'leaderboard', 'break',
    -- added in phase 4
    'fibbage', 'rank',
    -- added in phase 6
    'secret_mission'
  )
);
