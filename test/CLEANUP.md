# Temizlik notu

**Anonim auth kullanıcılarını silme.**

`auth.users` içindeki `is_anonymous` satırlarını toplu silmek zararsız görünüyor
ama iki şeyi birden bozuyor:

1. `test/.sessions.json` içindeki önbelleğe alınmış oturumlar geçersizleşiyor, bu
   yüzden her paket yeniden anonim kayıt açmak zorunda kalıyor.
2. Supabase anonim kaydı saatlik olarak sınırlıyor. Birkaç koşudan sonra kota
   doluyor ve **gerçek uygulama da giriş almıyor** — yani bir test temizliği
   canlı uygulamayı kilitleyebiliyor.

Bu satırlar yer kaplamıyor ve sorgular zaten `distinct` kullanıyor. Bırakın.

Gerçekten gerekiyorsa: önce `test/.sessions.json` ve `test/.sessions/` klasörünü
silin, sonra kotanın dolmasını göze alarak temizleyin.
