#!/usr/bin/env bash
# Tüm entegrasyon testlerini gerçek Supabase projesine karşı çalıştırır.
#   RETROBUS_HOST_CODE=xxxxxx ./test/run-all.sh
# Oturumlar test/.sessions.json'da önbelleklenir; anonim giriş kotasını yakma.
set -uo pipefail
cd "$(dirname "$0")/.."
fails=0
for t in flow phase3 phase4 phase5 phase6 reconnect agenda; do
  echo "################ $t ################"
  node "test/$t-test.mjs" || fails=$((fails + 1))
done
echo
if [ "$fails" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "$fails SUITE(S) FAILED"; fi
exit "$fails"
