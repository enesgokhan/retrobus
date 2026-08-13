# 🚌 Retrobüs

> **⏸ Parked since 2026-08-11 — the Supabase project is paused on purpose.**
> Read [PARKED.md](PARKED.md) first. The site loads but hangs, and every integration
> test fails; both are the database being off, not a regression.

3 saatlik uzaktan takım retrosu + oyun gecesi uygulaması. Vite + React + TypeScript SPA,
Supabase (Postgres + RLS + Realtime) üzerinde, GitHub Pages'te barındırılır.

**Canlı:** https://enesgokhan.github.io/retrobus/

Tüm sunucu mantığı Postgres içinde: edge function yok, sunucu yok, sır yok. Kimlik doğrulama
Supabase anonim girişi + `claim_member` fonksiyonu ile yapılır.

## Toplantı öncesi kontrol listesi

Sırayla yap, toplantıdan en az bir gün önce:

1. **Supabase projesini uyandır.** Ücretsiz tier 7 gün işlem görmezse duraklar. Haftalık cron
   ping'i var ama yine de siteyi açıp giriş yap.
2. **`/host/uyeler`** → herkesi ekle ve her birine 6 haneli kod ata. Kodları kendilerine ilet.
   Onlara söyle: **gerçekte kullandıkları bir PIN'i seçmesinler.**
3. **Kendi kodunu değiştir** (`/profil`) — kurulumdaki başlangıç kodu herkese açık bir URL'de
   duruyor.
4. **Rotayı kur.** Şoför konsolunda toplantı oluştur → "Rotayı kur" ile hazır 17 duraklı
   ~3 saatlik rota gelir. İstemediklerini sil, sırayı değiştir.
5. **Quiz sorularını hazırla.** Durak ayarları → Quiz → genel kültür bankasından ekle veya
   takım hakkında kendi sorularını yaz.
6. **Gizli görevleri dağıt** (Gizli Görev durağında "Görevleri dağıt") — toplantının
   BAŞINDA yap, durağı sona koy.
7. **Anonim giriş kotasını kontrol et.** Supabase varsayılanı 30/saat/IP. Herkes farklı
   ağdaysa sorun yok; ihtiyaç halinde Authentication → Rate Limits'ten yükselt.
8. **Prova yap** — 2-3 kişiyle bir durak aç, kart yaz, oyla.

Toplantı sırasında: **⏸ Ekranları dondur** butonu bir durak kötü giderse her ekranı anında
boşaltır. Sonunda **Yıllık** sekmesinden markdown/PDF çıktısını al.

## Kurulum (yeni bir Supabase projesine)

1. Supabase projesi oluştur, `Project URL` + `publishable key`'i `.env.local`'e yaz
   (bkz. `.env.example`).
2. **Authentication → Sign In / Providers → Anonymous sign-ins**'i AÇ. Bu olmadan hiç kimse
   giriş yapamaz.
3. Migrasyonları sırayla uygula:
   ```
   psql "$DB_URL" -f supabase/migrations/0001_spine.sql
   # 0002 … 0008 aynı şekilde
   ```
   IPv4 bir ağdaysan doğrudan `db.<ref>.supabase.co` yerine session-mode pooler'ı kullan:
   `postgresql://postgres.<ref>@aws-0-<region>.pooler.supabase.com:5432/postgres`

   `psql` yoksa aynı dosyaları Supabase panelindeki **SQL Editor**'a yapıştırmak da olur;
   hepsi tekrar çalıştırılabilir (`create or replace`, `drop policy if exists`).

   **Hangi migrasyonun uygulandığını canlı veritabanı söyler**, dosyalar değil:
   ```
   node test/migrations.mjs
   ```
   Migrasyonlar elle yapıştırıldığı için uygulanmışları tutan bir tablo yok. Bu komut
   her migrasyonun ETKİSİNİ gerçek yazma yolundan geçerek dener ve tek tabloda
   APPLIED / NOT APPLIED der — eksik olanın toplantı gecesinde ne kırdığını da yazar.
   Hepsi tekrar çalıştırılabilir, iki kez uygulamak bir şey bozmaz.
4. Kendini şoför yap:
   ```sql
   insert into members (display_name, is_host) values ('Enes', true);
   update members set code_hash = extensions.crypt('424242', extensions.gen_salt('bf',10))
   where display_name = 'Enes';
   ```
5. **GitHub repo variables** (Settings → Secrets and variables → Actions → Variables):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. İkisi de herkese açık olacak şekilde
   tasarlandı — güvenlik RLS'in işi.
6. Settings → Pages → Source: **GitHub Actions**.

## Geliştirme

```
cp .env.example .env.local
npm install
npm run dev
```

## Test

```
npm test                  # vitest (birim)
./test/run-all.sh         # gerçek projeye karşı entegrasyon (7 dosya, ~160 iddia)
npm run build             # tsc + vite
npm run lint              # oxlint
```

Entegrasyon testleri gerçek Supabase projesine bağlanır ve oturumları
`test/.sessions.json`'da önbelleğe alır — anonim giriş kotasını yakmamak için. Kendi kodun
`424242` değilse: `RETROBUS_HOST_CODE=xxxxxx ./test/run-all.sh`

## Güvenlik modeli

**Anonim giriş, `authenticated` rolünü URL'yi bulan HERKESE verir.** Dolayısıyla bu rol tek
başına hiçbir şey kanıtlamaz: her politika gerçek bir üyelik bağı ister
(`auth_member_id() is not null`). `using (true)` yazan yeni bir politika veri sızıntısıdır.

**`SECURITY DEFINER` RLS'i kapatır**, o yüzden fonksiyon kontrolü kendisi yapmak zorunda.
`leaderboard()` ve `awards()` bunu ilk sürümde yapmıyordu ve denetimde yakalandı.

**Anonimlik şema düzeyinde.** `cards` (anonim panolarda), `votes`, `poll_responses`,
`health_responses`, `feedback_items`, `rank_submissions` yazar kolonu taşımaz ve hassas
zaman damgası tutmaz — yalnızca rastgele `sort_seed`, ki görüntü sırası da her zaman odur.
Kişi başı limitler ayrı bir `participation` defterinde; içerik satırıyla ortak anahtarı yok,
ikisi tek transaction'da yazılır.

**Gizli bilgi kendi tablosunda.** Satır politikası tek bir kolonu koruyamaz, sütun yetkisi de
koşullu olamaz. Bu yüzden: `two_truths_keys`, `quiz_keys`, `wave_targets`, `cn_keys` ve
Fibbage'ın `fib_authorship()` fonksiyonu. Codenames anahtar kartı **yalnızca** o oyunun
spymaster'larına gider — operatör sıfır satır görür, istemcide filtreleme yok.

**Dürüst sınır:** Supabase projesinin sahibi sensin, yani ham veritabanı erişimin var. Şema
yazarlığı düşürüyor ama "uygulamadan anonim" ile "Enes'ten anonim" aynı şey değil. Takıma bir
kez açıkça söyle.

## Testin yakaladığı, kodu okumanın yakalamadığı hatalar

Kayıt olsun diye: entegrasyon testleri 8 gerçek hata buldu, birim testleri hiçbirini bulamazdı.

- `claim_member` `returns table (... display_name ...)` idi; OUT parametreleri `members`
  kolonlarını gölgeleyip her çağrıyı 42702 ile düşürüyordu — **giriş tamamen çalışmıyordu.**
- Hatalı kimlik bilgisinde `raise` transaction'ı geri alıyor, az önce yazılan başarısız-deneme
  sayacını da siliyordu — **kilitleme sessizce etkisizdi.**
- `cast_dot` `assert_stage_open` çağırıyordu ama oylama `revealed` fazında olur — **oylama tam
  olması gereken fazda imkansızdı.**
- Fibbage'da yalan yazarlığı tahmin fazında okunabiliyordu — **oyunun tamamı boşa çıkıyordu.**
- `leaderboard()`/`awards()` üyelik kontrolü yapmıyordu — **çıkış yapmış biri isimleri ve
  puanları listeleyebiliyordu.**
- Postgres yeni fonksiyonlara PUBLIC'e EXECUTE verir — **her RPC `anon` rolüne açıktı.**
- `assign_missions`'da `select distinct id, row_number() over (...)` tekilleştirmiyordu —
  4 kişiye 5 görev.
- Realtime, `subscribe()` SUBSCRIBED dedikten hemen sonraki değişiklikleri düşürüyordu —
  bir yolcunun ekranı yanlış durakta kalabilirdi.
