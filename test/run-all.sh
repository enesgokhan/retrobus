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
# /sunum is projected to the whole call and the session doing the projecting
# is a real player with real answers. Three "this one is yours" affordances
# were rendering there — Fibbage labelled the projector's own lie, which tells
# the room outright which option is false. Every private marker must carry a
# !presenter guard. This is a static check and says so: it catches the class of
# regression, not every possible leak.
echo "################ private markers on /sunum ################"
leak=0
for pat in "senin yalanın" "senin tahminin" "senin cevabın"; do
  while IFS= read -r hit; do
    [ -z "$hit" ] && continue
    f=${hit%%:*}; n=$(echo "$hit" | cut -d: -f2)
    ctx=$(sed -n "$((n>3?n-3:1)),$((n+1))p" "$f")
    case "$ctx" in *'!presenter'*) ;; *) echo "  UNGUARDED $f:$n — $pat"; leak=1 ;; esac
  done <<< "$(grep -rn "$pat" src --include='*.tsx' || true)"
done
if [ "$leak" = "1" ]; then echo "PRIVATE MARKER REACHES THE SHARED SCREEN"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

echo "################ tailwind v3 syntax ################"
v3=$(grep -rnE '\b(bg|text|border|ring|fill|stroke|shadow|from|to|via|accent|outline|decoration|caret)-\[--' src --include='*.tsx' || true)
if [ -n "$v3" ]; then echo "$v3"; echo "V3 ARBITRARY-PROPERTY SYNTAX — use bg-(--tint), not bg-[--tint]"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

# And the general form of the same failure: a utility that emits no CSS at all.
echo "################ dead tokens ################"
dead=$(grep -rnoE '\b(border-line|border-line-strong|bg-card|bg-surface|bg-raised|text-ink|text-ink-soft|text-ink-faint|bg-ink|border-ink|input-blob|btn-coral|btn-ghost)\b' src --include='*.tsx' || true)
if [ -n "$dead" ]; then echo "$dead"; echo "DEAD TOKENS IN USE"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

# The stage screens drifted away from the system the chrome around them is
# built from — and the stages are where three hours are actually spent. Seven
# hand-rolled spellings of the overline, weights outside the ramp, the 30px
# projector radius on ordinary buttons, and opacity multipliers standing in for
# an ink token. All of it typechecked, and none of it was measurable, because
# the design gates read `index.css` and these were decisions made in TSX.
echo "################ design-system drift ################"
drift=0
# Tracking out is the overline's job and the digit-group's job. Nothing else.
# Every hand-rolled overline in this codebase announced itself with one of these.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  case "$hit" in *nums*) ;; *) echo "  $hit"; drift=1 ;; esac
done <<< "$(grep -rnE 'tracking-(wider|widest|\[)' src --include='*.tsx' || true)"
# `uppercase` means an eyebrow, which is one class that carries its own case.
# The exceptions are display type, which is uppercased for effect at title size.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  case "$hit" in *tracking-wide\'*|*tracking-tight*) ;; *) echo "  $hit"; drift=1 ;; esac
done <<< "$(grep -rn 'uppercase' src --include='*.tsx' | grep -v '^\s*\*\|/\*\*' || true)"
# 30px is the projected screen. A button is not a projected screen.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  echo "  $hit"; drift=1
done <<< "$(grep -rn 'rounded-2xl\|rounded-3xl' src --include='*.tsx' || true)"
if [ "$drift" = "1" ]; then echo "DRIFTED FROM THE DESIGN SYSTEM"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

# A colour typed into a class string belongs to whichever theme the author had
# open. Twelve game buttons and the Codenames key card carried the dark theme's
# near-black ink as a constant, so they ran at 2.77–3.22:1 in the light theme —
# on the key card, 1.15:1 — while every contrast assertion passed, because the
# assertions read tokens and these were not tokens.
#
# This gate is the CONTROL for the check below it: `contrast.mjs` measures every
# `text-(--ink-on-*)` against the fill on its line, and that measurement is only
# worth anything if a hex cannot be written instead. One is useless without the
# other, so they sit together.
echo "################ raw colour in class strings ################"
raw=$(grep -rnE '\b(text|bg|border|ring|fill|stroke|from|to|via|shadow|decoration|outline|accent|caret)-\[[^]]*#[0-9a-fA-F]{3}' src --include='*.tsx' || true)
if [ -n "$raw" ]; then echo "$raw"; echo "HARDCODED COLOUR — use a token, or the other theme gets the wrong one"; fails=$((fails + 1)); else echo "ALL CHECKS PASSED"; fi

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
suites="publication grants flow phase3 phase4 phase5 phase6 reconnect agenda iteration rules fibbage-cheat join-code codenames-fit reveal-live presenter-secrets hidden reveal-poll progress-keys mission-count smoke-play rehearsal messy-night blocked-network"
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
