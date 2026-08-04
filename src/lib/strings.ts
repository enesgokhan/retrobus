// Tüm kullanıcı-görünür metinler burada. UI dili: Türkçe.
// Retrobüs jargonu: ajanda = "rota", segment = "durak", host = "şoför", ekip = "yolcular".

export const S = {
  appName: 'Retrobüs',
  tagline: 'Takım retrosu ve oyunlar, tek bir akışta.',

  // Giriş
  loginTitle: 'Giriş',
  loginName: 'Adın',
  loginNamePlaceholder: 'örn. Enes',
  loginCode: 'Kodun',
  loginButton: 'Devam',
  loginWrong: 'Ad veya kod hatalı.',
  loginNoCode: 'Sana henüz kod atanmamış. Toplantıyı yöneten kişiye sor.',
  loginLocked: (sec: number) =>
    `Çok fazla deneme. ${Math.ceil(sec / 60)} dakika sonra tekrar dene.`,
  loginError: 'Bir şeyler ters gitti, tekrar dene.',
  loginWaiting: 'Sunucu yoğun, birkaç saniye.',
  loginRateLimited:
    'Aynı anda çok kişi giriş yaptı. Birkaç dakika sonra tekrar dene — kodun doğru.',
  loginUnconfigured: 'Uygulama henüz sunucuya bağlanmadı (Supabase ayarları eksik).',

  // Ortak
  loading: 'Yükleniyor…',
  logout: 'Çıkış',
  save: 'Kaydet',
  cancel: 'Vazgeç',
  delete: 'Sil',
  add: 'Ekle',
  close: 'Kapat',
  ok: 'Tamam',

  // Yolcu görünümü
  endedTitle: 'Toplantı bitti',
  endedBody: 'Bu akşamlık bu kadar. Yıllık burada duruyor.',
  waitingTitle: 'Birazdan başlıyoruz',
  waitingBody: 'Akış hazırlanıyor.',
  nextStop: 'Sonraki durak',
  currentStop: 'Şu anki durak',

  // Durak durumları
  stagePending: 'Hazırlanıyor',
  stageOpen: 'Açık',
  stageRevealed: 'Sonuçlar açıldı',
  stageClosed: 'Tamamlandı',

  // Şoför konsolu
  hostConsole: 'Konsol',
  route: 'Rota',
  newMeeting: 'Yeni toplantı',
  meetingTitlePlaceholder: 'örn. 2026 Yaz Retrosu',
  addStop: 'Durak ekle',
  goLive: 'Yayına al',
  makeActive: 'Bu durağa geç',
  openStage: 'Aç',
  revealStage: 'Sonuçları göster',
  closeStage: 'Kapat',
  members: 'Yolcular',
  addMember: 'Yolcu ekle',
  memberNamePlaceholder: 'Ad',
  setCode: 'Kod ata',
  codePlaceholder: '6 haneli kod',
  codeSaved: 'Kod kaydedildi.',
  codeInvalid: 'Kod tam 6 rakam olmalı.',
  isHost: 'şoför',

  // Dondurma (panik butonu)
  frozenTitle: 'Kısa bir ara',
  frozenBody: 'Ekranlar bir saniye durduruldu. Ekranına bakmayı bırakabilirsin.',
  freeze: 'Ekranları dondur',
  unfreeze: 'Devam et',

  // Zamanlayıcı
  timerStart: 'Başlat',
  timerPause: 'Duraklat',
  timerResume: 'Devam',
  timerPlusMinute: '+1 dk',
  timerStop: 'Sıfırla',

  // Durak türleri (etiketler)
  kind: {
    wordcloud: 'Kelime Bulutu',
    two_truths: 'İki Doğru Bir Yalan',
    health_check: 'Takım Nabzı',
    lean_coffee: 'Lean Coffee',
    board: 'Tartışma Panosu',
    poll: 'Anket',
    feedback_wall: 'Geri Bildirim Duvarı',
    suggestions: 'Öneriler',
    quiz: 'Bilgi Yarışması',
    codenames: 'Kelime Ajanları',
    wavelength: 'Frekans',
    leaderboard: 'Şampiyonluk Tablosu',
    break: 'Mola',
    fibbage: 'Fibbage — İnandırıcı Yalan',
    rank: 'Sırala Bakalım',
    secret_mission: 'Gizli Görev',
  } as Record<string, string>,

  // Hazır panolar
  boardPresets: {
    ground: 'Takım Zemini — biz kimiz?',
    vision: 'Vizyon — nereye gidiyoruz?',
    pains: 'Sancılar — ne acıtıyor?',
    wins: 'İyi Şeyler — ne güzel gidiyor?',
  },
} as const
