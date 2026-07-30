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
]

export function presetsByKind(kind: StageKind): StagePreset[] {
  return STAGE_PRESETS.filter((p) => p.kind === kind)
}
