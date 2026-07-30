/**
 * Frekans (Wavelength) için Türkçe spektrum çiftleri.
 * İyi bir çift öznel ve tartışmaya açıktır — "küçük/büyük" gibi ölçülebilir
 * olanlar sıkıcı; "abartılmış/hakkını almamış" gibi olanlar tartışma çıkarır.
 */
export interface SpectrumPair {
  left: string
  right: string
}

export const SPECTRUM_PAIRS: SpectrumPair[] = [
  { left: 'soğuk', right: 'sıcak' },
  { left: 'lezzetli', right: 'iğrenç' },
  { left: 'ucuz', right: 'pahalı' },
  { left: 'sıkıcı', right: 'heyecanlı' },
  { left: 'abartılmış', right: 'hakkını almamış' },
  { left: 'kötü alışkanlık', right: 'masum zevk' },
  { left: 'işe yaramaz', right: 'hayat kurtarıcı' },
  { left: 'unutulmuş', right: 'efsane' },
  { left: 'basit', right: 'karmaşık' },
  { left: 'gereksiz', right: 'zorunlu' },
  { left: 'utanç verici', right: 'gurur duyulacak' },
  { left: 'yasak', right: 'serbest' },
  { left: 'sessiz', right: 'gürültülü' },
  { left: 'eski moda', right: 'gelecekten gelmiş' },
  { left: 'çocukça', right: 'olgun' },
  { left: 'tatlı', right: 'tuzlu' },
  { left: 'korkutucu', right: 'sevimli' },
  { left: 'yavaş', right: 'hızlı' },
  { left: 'kolay iş', right: 'imkansız iş' },
  { left: 'sıradan', right: 'lüks' },
  { left: 'kişisel', right: 'herkese açık' },
  { left: 'geçici heves', right: 'kalıcı tutku' },
  { left: 'yorucu', right: 'dinlendirici' },
  { left: 'ciddi', right: 'komik' },
  { left: 'sağlıklı', right: 'zararlı' },
  { left: 'yalnız yapılır', right: 'kalabalıkla yapılır' },
  { left: 'planlı', right: 'anlık' },
  { left: 'küçük detay', right: 'büyük mesele' },
  { left: 'kimse bilmez', right: 'herkes bilir' },
  { left: 'hafif', right: 'ağır' },
]
