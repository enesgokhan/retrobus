#!/usr/bin/env bash
# Tüm testleri gerçek Supabase projesine karşı çalıştırır.
#   ./test/run-all.sh          -> veritabanı + kural testleri
#   E2E=1 ./test/run-all.sh    -> ayrıca tarayıcı testi (Playwright gerekir)
# Oturumlar test/.sessions.json'da önbelleklenir; anonim giriş kotasını yakma.
set -uo pipefail
cd "$(dirname "$0")/.."
fails=0

# Design gates run FIRST and need no database, so a contrast regression or a
# sub-44px touch target is reported in two seconds rather than after twenty
# minutes of browser suites. Both are checks that were asserted in comments for
# a long time and never actually computed.
npm run build >/dev/null 2>&1 || { echo "build failed"; fails=$((fails + 1)); }
# Tailwind emits a utility only for a theme value it can resolve at build
# time, so `--color-line: var(--color-sep)` produced NO `.border-line` rule at
# all — and `border-line` silently fell back to currentColor, painting a
# near-white border on 25 elements. A class that does not exist fails silently,
# which is the worst way for a class to fail. These names are banned outright.
# Tailwind v3 wrapped a bare `[--var]` arbitrary value in var(); v4 does not.
# `bg-[--tint]` therefore compiles to `background-color: --tint`, which every
# browser discards — so the stage tint was silently absent from 22 places: the
# readiness meter, the live dots, the Break countdown, the Leaderboard hero
# number, and every selected-state control that spelled selection as a tint
# fill. It typechecks, it lints, and it renders as "the tint is a bit subtle".
echo "################ tailwind v3 syntax ################"
v3=$(grep -rnE '\b(bg|text|border|ring|fill|stroke|shadow|from|to|via|accent|outline|decoration|caret)-\[--' src --include='*.tsx' || true)
if [ -n "$v3" ]; then echo "$v3"; echo "V3 ARBITRARY-PROPERTY SYNTAX — use bg-(--tint), not bg-[--tint]"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

# And the general form of the same failure: a utility that emits no CSS at all.
echo "################ dead tokens ################"
dead=$(grep -rnoE '\b(border-line|border-line-strong|bg-card|bg-surface|bg-raised|text-ink|text-ink-soft|text-ink-faint|bg-ink|border-ink|input-blob|btn-coral|btn-ghost)\b' src --include='*.tsx' || true)
if [ -n "$dead" ]; then echo "$dead"; echo "DEAD TOKENS IN USE"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

echo "################ contrast ################"
node test/contrast.mjs || fails=$((fails + 1))
echo "################ a11y (desktop) ################"
node test/a11y.mjs || fails=$((fails + 1))
echo "################ a11y (phone) ################"
W=430 H=930 node test/a11y.mjs || fails=$((fails + 1))

# `smoke-play` was missing from this list even though it is the suite that
# actually plays every game to a finish. `ten-people` and `measure-fill` stay
# out on purpose: the first burns the anonymous sign-in quota, the second is a
# ruler rather than a pass/fail.
suites="publication grants flow phase3 phase4 phase5 phase6 reconnect agenda iteration rules fibbage-cheat join-code codenames-fit reveal-live presenter-secrets smoke-play rehearsal messy-night blocked-network"
for t in $suites; do
  echo "################ $t ################"
  # Suites are named either foo-test.mjs or foo.mjs. This used to assume the
  # first, so rehearsal, messy-night, blocked-network and fibbage-cheat join-code codenames-fit — the
  # four newest and most valuable — were silently never run by this script.
  if [ -f "test/$t-test.mjs" ]; then
    node "test/$t-test.mjs" || fails=$((fails + 1))
  elif [ -f "test/$t.mjs" ]; then
    node "test/$t.mjs" || fails=$((fails + 1))
  else
    echo "MISSING SUITE: $t"
    fails=$((fails + 1))
  fi
done
if [ "${E2E:-0}" = "1" ]; then
  echo "################ e2e (browser) ################"
  npm run build >/dev/null 2>&1 || { echo "build failed"; fails=$((fails + 1)); }
  node test/e2e-play.mjs || fails=$((fails + 1))
fi
echo
if [ "$fails" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "$fails SUITE(S) FAILED"; fi
exit "$fails"
