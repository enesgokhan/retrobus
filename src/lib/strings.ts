// Tüm kullanıcı-görünür metinler burada. UI dili: Türkçe.
// Retrobüs jargonu: ajanda = "rota", segment = "durak", host = "şoför", ekip = "yolcular".

export const S = {
  appName: 'Retrobüs',
  tagline: 'Takım retrosu, oyunlar ve daha fazlası — hep birlikte tek rotada.',

  // Giriş
  loginTitle: 'Otobüse binin',
  loginName: 'Adınız',
  loginNamePlaceholder: 'örn. Enes',
  loginCode: 'Bilet kodun',
  loginButton: 'Hadi bin',
  loginWrong: 'Ad veya kod hatalı.',
  loginNoCode: 'Size henüz kod atanmamış — şoföre söyleyin.',
  loginLocked: (sec: number) =>
    `Çok fazla deneme. ${Math.ceil(sec / 60)} dakika sonra tekrar deneyin.`,
  loginError: 'Bir şeyler ters gitti, tekrar deneyin.',
  loginWaiting: 'Sıraya girdik — sunucu yoğun, birkaç saniye…',
  loginRateLimited:
    'Aynı anda çok kişi giriş yaptı — sunucu bir süre yeni giriş almıyor. ' +
    'Birkaç dakika bekleyip tekrar dene; kodun doğru, sorun sende değil.',
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
  endedTitle: 'Otobüs garaja döndü',
  endedBody: 'Bu akşamlık bu kadar. İyi ki geldin — yıllık burada kalıyor.',
  waitingTitle: 'Otobüs kalkmak üzere',
  waitingBody: 'Şoför rotayı ayarlıyor. Birazdan hareket ediyoruz.',
  nextStop: 'Sonraki durak',
  currentStop: 'Şu anki durak',

  // Durak durumları
  stagePending: 'Hazırlanıyor',
  stageOpen: 'Açık',
  stageRevealed: 'Sonuçlar açıldı',
  stageClosed: 'Tamamlandı',

  // Şoför konsolu
  hostConsole: 'Şoför Konsolu',
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
  frozenBody: 'Şoför bir saniye durdurdu. Ekranına bakmayı bırakabilirsin.',
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
