#!/usr/bin/env bash
# Tüm testleri gerçek Supabase projesine karşı çalıştırır.
#   ./test/run-all.sh          -> veritabanı + kural testleri
#   E2E=1 ./test/run-all.sh    -> ayrıca tarayıcı testi (Playwright gerekir)
# Oturumlar test/.sessions.json'da önbelleklenir; anonim giriş kotasını yakma.
set -uo pipefail
cd "$(dirname "$0")/.."
fails=0
suites="publication grants flow phase3 phase4 phase5 phase6 reconnect agenda iteration rules fibbage-cheat join-code codenames-fit reveal-live presenter-secrets rehearsal messy-night blocked-network"
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
