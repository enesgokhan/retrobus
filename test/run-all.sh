#!/usr/bin/env bash
# Tüm testleri gerçek Supabase projesine karşı çalıştırır.
#   ./test/run-all.sh          -> veritabanı + kural testleri
#   E2E=1 ./test/run-all.sh    -> ayrıca tarayıcı testi (Playwright gerekir)
# Oturumlar test/.sessions.json'da önbelleklenir; anonim giriş kotasını yakma.
set -uo pipefail
cd "$(dirname "$0")/.."
fails=0
suites="publication grants flow phase3 phase4 phase5 phase6 reconnect agenda iteration rules reveal-live presenter-secrets"
for t in $suites; do
  echo "################ $t ################"
  node "test/$t-test.mjs" || fails=$((fails + 1))
done
if [ "${E2E:-0}" = "1" ]; then
  echo "################ e2e (browser) ################"
  npm run build >/dev/null 2>&1 || { echo "build failed"; fails=$((fails + 1)); }
  node test/e2e-play.mjs || fails=$((fails + 1))
fi
echo
if [ "$fails" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "$fails SUITE(S) FAILED"; fi
exit "$fails"
