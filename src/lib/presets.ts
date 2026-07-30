import type { StageConfig, StageKind } from './types'

export interface StagePreset {
  key: string
  label: string
  kind: StageKind
  title: string
  config: StageConfig
}

/**
 * Hazır duraklar. Şoför konsolundan tek tıkla rotaya eklenir.
 * `reveal: 'batch'` = kartlar herkes yazana kadar gizli (demirleme etkisini önler).
 */
export const STAGE_PRESETS: StagePreset[] = [
  // --- tartışma saati: dört pano ---
  {
    key: 'board_ground',
    label: 'Pano: Takım Zemini',
    kind: 'board',
    title: 'Takım Zemini — biz kimiz?',
    config: {
      identity: 'named',
      reveal: 'batch',
      dots: 3,
      timer_s: 420,
      prompt: 'Bizi biz yapan ne? Yazılı olmayan kurallarımız neler?',
      columns: [
        { key: 'are', label: 'Biz buyuz' },
        { key: 'stand', label: 'Şuna inanıyoruz' },
      ],
    },
  },
  {
    key: 'board_vision',
    label: 'Pano: Vizyon',
    kind: 'board',
    title: 'Vizyon — nereye gidiyoruz?',
    config: {
      identity: 'named',
      reveal: 'batch',
      dots: 3,
      timer_s: 480,
      prompt: '6-12 ay sonra bu takım nerede olsun?',
      columns: [
        { key: 'goal', label: 'Hedef' },
        { key: 'change', label: 'Bunu değiştirmeliyiz' },
      ],
    },
  },
  {
    key: 'board_pains',
    label: 'Pano: Sancılar',
    kind: 'board',
    title: 'Sancılar — ne acıtıyor?',
    config: {
      // dürüst şikayet için anonim
      identity: 'anon',
      reveal: 'batch',
      dots: 5,
      timer_s: 480,
      prompt: 'Neyi tıkıyoruz, ne zaman kaybediyoruz, ne sinir bozuyor? (anonim)',
      columns: [
        { key: 'blocked', label: 'Tıkanma' },
        { key: 'waste', label: 'Zaman kaybı' },
        { key: 'friction', label: 'Sürtünme' },
      ],
    },
  },
  {
    key: 'board_wins',
    label: 'Pano: İyi Şeyler',
    kind: 'board',
    title: 'İyi Şeyler — ne güzel gidiyor?',
    config: {
      identity: 'named',
      reveal: 'live',
      dots: 3,
      timer_s: 300,
      prompt: 'Neyi korumalıyız? Neyle gurur duyuyoruz?',
      columns: [
        { key: 'keep', label: 'Bunu koruyalım' },
        { key: 'proud', label: 'Gurur duyduğumuz' },
      ],
    },
  },

  // --- lean coffee ---
  {
    key: 'lean_coffee',
    label: 'Lean Coffee',
    kind: 'lean_coffee',
    title: 'Lean Coffee — konuları biz seçiyoruz',
    config: {
      identity: 'named',
      reveal: 'live',
      dots: 3,
      timer_s: 300,
      prompt: 'Konuşmak istediğin konuyu yaz, sonra hep birlikte oylayıp sıraya dizeceğiz.',
    },
  },

  // --- öneriler ---
  {
    key: 'suggestions',
    label: 'Öneriler (gelecek dönem)',
    kind: 'suggestions',
    title: 'Gelecek dönem: konular ve vizyon',
    config: {
      identity: 'anon',
      reveal: 'batch',
      dots: 5,
      timer_s: 420,
      prompt: 'Gelecek dönem neye odaklanalım? (anonim — sonra oylayacağız)',
    },
  },

  // --- AMA: anonim soru + oylama, en iyi sorular yukarı çıkar ---
  {
    key: 'ama',
    label: 'Ne Sorsan Söylerim (AMA)',
    kind: 'suggestions',
    title: 'Ne sorsan söylerim',
    config: {
      identity: 'anon',
      reveal: 'batch',
      dots: 3,
      timer_s: 300,
      prompt: 'Merak ettiğin her şeyi sor — anonim. En çok oy alanları canlı cevaplayacağız.',
    },
  },

  // --- buz kırıcılar ---
  {
    key: 'wordcloud',
    label: 'Kelime Bulutu',
    kind: 'wordcloud',
    title: 'Geçen dönem tek kelimeyle',
    config: {
      identity: 'anon',
      reveal: 'live',
      timer_s: 120,
      maxWords: 3,
      prompt: 'Geçen dönemi anlatan tek kelime yaz. Aynı kelimeler büyür.',
    },
  },
  {
    key: 'two_truths',
    label: 'İki Doğru Bir Yalan',
    kind: 'two_truths',
    title: 'İki Doğru Bir Yalan',
    config: {
      timer_s: 240,
      prompt: 'Üç cümle yaz, biri yalan olsun. Doğru tahmin +2, kandırdığın her kişi +1.',
    },
  },
  {
    key: 'health_check',
    label: 'Takım Nabzı',
    kind: 'health_check',
    title: 'Takım Nabzı',
    config: {
      reveal: 'batch',
      timer_s: 300,
      prompt: 'Her boyut için kırmızı / sarı / yeşil seç. Tamamen anonim.',
    },
  },

  // --- geri bildirim ---
  {
    key: 'feedback_wall',
    label: 'Geri Bildirim Duvarı',
    kind: 'feedback_wall',
    title: 'Geri Bildirim Duvarı',
    config: {
      reveal: 'batch',
      timer_s: 900,
      prompt:
        'Takım arkadaşların için güçlü yön ve gelişim alanı yaz. Anonim — hepsi aynı anda açılacak.',
    },
  },
  {
    key: 'quiz',
    label: 'Bilgi Yarışması',
    kind: 'quiz',
    title: 'Bilgi Yarışması',
    config: {
      timer_s: 25,
      prompt: 'Hızlı ol — erken doğru cevap daha çok puan getirir.',
    },
  },
  {
    key: 'fibbage',
    label: 'Fibbage (inandırıcı yalan)',
    kind: 'fibbage',
    title: 'Fibbage',
    config: {
      timer_s: 180,
      prompt: 'Gerçek cevabı bul, bu arada kendi yalanınla başkalarını kandır.',
    },
  },
  {
    key: 'rank',
    label: 'Sırala Bakalım',
    kind: 'rank',
    title: 'Sırala Bakalım',
    config: {
      reveal: 'batch',
      timer_s: 180,
      prompt: 'Listeyi gizlice sırala — sonra ne kadar benzer düşündüğümüzü göreceğiz.',
    },
  },
  {
    key: 'codenames',
    label: 'Kelime Ajanları (Codenames TR)',
    kind: 'codenames',
    title: 'Kelime Ajanları',
    config: {
      prompt: 'Takımını seç, spymaster gönüllü olsun. Suikastçıya dokunan kaybeder.',
    },
  },
  {
    key: 'wavelength',
    label: 'Frekans (Wavelength)',
    kind: 'wavelength',
    title: 'Frekans',
    config: {
      timer_s: 120,
      prompt: 'Bir kişi gizli noktayı görür, tek kelimeyle anlatır; herkes kadranı kaydırır.',
    },
  },
  {
    key: 'secret_mission',
    label: 'Gizli Görev (finalde aç)',
    kind: 'secret_mission',
    title: 'Gizli Görevler',
    config: {
      prompt: 'Görevleri toplantının başında dağıt, bu durağı sona koy.',
    },
  },
  {
    key: 'leaderboard',
    label: 'Şampiyonluk Tablosu (final)',
    kind: 'leaderboard',
    title: 'Şampiyonluk Tablosu',
    config: {
      prompt: 'Sıralama toplantı boyunca gizliydi. Şimdi açıyoruz.',
    },
  },
  {
    key: 'kudos_wall',
    label: 'Teşekkür Duvarı',
    kind: 'feedback_wall',
    title: 'Teşekkür Duvarı',
    config: {
      mode: 'kudos',
      reveal: 'batch',
      timer_s: 420,
      prompt: 'Kime, ne için teşekkür etmek istersin? Anonim, hepsi birden açılacak.',
    },
  },
]

export function presetsByKind(kind: StageKind): StagePreset[] {
  return STAGE_PRESETS.filter((p) => p.kind === kind)
}
