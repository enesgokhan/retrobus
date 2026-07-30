# 🚌 Retrobüs

3 saatlik uzaktan takım retrosu + oyun gecesi uygulaması. Vite + React + TypeScript SPA,
Supabase (Postgres + RLS + Realtime + Edge Functions) üzerinde, GitHub Pages'te barındırılır.

Tam plan: `~/.claude/plans/transient-foraging-kernighan.md`

## Kurulum (bir kerelik)

1. **Supabase projesi oluştur** (ücretsiz tier) → Project Settings'ten şunları al:
   - `Project URL` ve `anon public key` → `.env.local` (bkz. `.env.example`)
   - `service_role key` ve `JWT secret` → Edge Function secrets (aşağıya bak)
2. Migrasyonları uygula: `supabase db push` (veya SQL Editor'e `supabase/migrations/*.sql`'i
   sırayla yapıştır).
3. Edge Function secrets ayarla:
   ```
   supabase secrets set JWT_SECRET=<Project Settings → API → JWT Secret>
   supabase secrets set ALLOWED_ORIGINS=https://enesgokhan.github.io,http://localhost:5173
   ```
   (`SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` fonksiyonlara otomatik enjekte edilir.)
4. Fonksiyonları deploy et: `supabase functions deploy login && supabase functions deploy set-member-code`
5. **GitHub repo variables** (Settings → Secrets and variables → Actions → Variables) — deploy
   workflow'un derleme sırasında okuduğu, herkese açık değerler:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Repo Settings → Pages → Source: **GitHub Actions**.
7. Kendini host olarak işaretle: SQL Editor'de
   `update members set is_host = true where display_name = 'Enes';` (ilk üyeyi elle ekleyip).

## Yerel geliştirme

```
cp .env.example .env.local   # değerleri doldur
npm install
npm run dev
```

## Test & build

```
npm test        # vitest
npm run build   # tsc + vite build
npm run lint    # oxlint
```

## Toplantı öncesi kontrol listesi

- [ ] Supabase projesi uyanık mı? (`curl` ile `/rest/v1/` ping'i haftalık cron zaten atıyor —
      yine de toplantıdan 10 dk önce siteyi aç ve giriş yapmayı dene)
- [ ] `/host/uyeler`'den herkesin adı girilmiş ve kodu atanmış mı?
- [ ] Rota (ajanda) hazır mı?
