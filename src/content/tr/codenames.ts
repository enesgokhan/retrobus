/**
 * Kelime Ajanları için Türkçe kelime listesi.
 *
 * Seçim ölçütleri:
 *   - somut, gündelik, herkesin bildiği isimler
 *   - özel isim YOK (kişi, marka, şehir, ülke)
 *   - çok anlamlı kelimeler tercih edildi (yüz, kaz, dolu, çay, gül…) —
 *     Codenames'i eğlenceli yapan şey ipucunun birden fazla kelimeye
 *     bağlanabilmesi
 *   - tek kelime, tirelisiz, kısaltmasız
 */
export const CODENAMES_TR: string[] = [
  // çok anlamlılar — oyunun tuzu biberi
  'yüz', 'kaz', 'dolu', 'çay', 'gül', 'kır', 'sar', 'tak', 'yaz', 'kat',
  'top', 'kalp', 'kanat', 'aç', 'boya', 'çek', 'diz', 'el', 'göz', 'saat',
  'ocak', 'bakla', 'masa', 'maya', 'makara', 'derece', 'adet', 'parti', 'iskele', 'takım',
  'bilet', 'kaset', 'kova', 'küpe', 'zil', 'perde', 'düğme', 'iplik', 'kilit', 'anahtar',

  // hayvanlar
  'kedi', 'köpek', 'penguen', 'aslan', 'kaplan', 'fil', 'zürafa', 'maymun', 'tavşan', 'kurbağa',
  'yılan', 'balık', 'köpekbalığı', 'ahtapot', 'yengeç', 'karınca', 'arı', 'kelebek', 'örümcek', 'baykuş',
  'kartal', 'karga', 'güvercin', 'horoz', 'ördek', 'inek', 'koyun', 'keçi', 'domuz', 'fare',
  'kirpi', 'tilki', 'kurt', 'ayı', 'geyik', 'deve', 'at', 'eşek', 'kaplumbağa', 'salyangoz',
  'balina', 'yunus', 'foka', 'papağan', 'tavus', 'leylek', 'martı', 'akrep', 'sinek', 'solucan',

  // yiyecek içecek
  'ekmek', 'peynir', 'zeytin', 'domates', 'salatalık', 'patates', 'soğan', 'sarımsak', 'biber', 'patlıcan',
  'elma', 'armut', 'kiraz', 'karpuz', 'kavun', 'üzüm', 'muz', 'portakal', 'limon', 'çilek',
  'fındık', 'ceviz', 'badem', 'fıstık', 'bal', 'reçel', 'yoğurt', 'süt', 'tereyağı', 'yumurta',
  'pilav', 'çorba', 'köfte', 'kebap', 'lahmacun', 'börek', 'poğaça', 'simit', 'baklava', 'lokum',
  'dondurma', 'pasta', 'kurabiye', 'şeker', 'tuz', 'karabiber', 'nane', 'kahve', 'ayran', 'şerbet',

  // ev ve eşya
  'kapı', 'pencere', 'duvar', 'çatı', 'merdiven', 'asansör', 'bodrum', 'balkon', 'bahçe', 'çit',
  'yatak', 'yastık', 'battaniye', 'dolap', 'çekmece', 'sandalye', 'koltuk', 'halı', 'ayna', 'lamba',
  'mum', 'soba', 'fırın', 'buzdolabı', 'çamaşır', 'süpürge', 'leğen', 'sabun', 'havlu', 'diş',
  'tarak', 'makas', 'iğne', 'çengel', 'çekiç', 'testere', 'merdane', 'kazan', 'tencere', 'tabak',
  'çatal', 'kaşık', 'bıçak', 'bardak', 'fincan', 'şişe', 'kutu', 'sepet', 'torba', 'çanta',

  // doğa
  'ağaç', 'yaprak', 'kök', 'dal', 'çiçek', 'diken', 'çim', 'orman', 'çöl', 'dağ',
  'tepe', 'vadi', 'mağara', 'nehir', 'göl', 'deniz', 'ada', 'kum', 'kaya', 'taş',
  'toprak', 'çamur', 'buz', 'kar', 'yağmur', 'bulut', 'rüzgar', 'fırtına', 'şimşek', 'gökkuşağı',
  'güneş', 'ay', 'yıldız', 'gölge', 'ateş', 'duman', 'kül', 'su', 'hava', 'gök',

  // ulaşım
  'araba', 'otobüs', 'tren', 'uçak', 'gemi', 'kayık', 'bisiklet', 'motor', 'kamyon', 'traktör',
  'helikopter', 'balon', 'roket', 'uydu', 'ambulans', 'itfaiye', 'vapur', 'tramvay', 'metro', 'liman',
  'köprü', 'tünel', 'yol', 'ray', 'tekerlek', 'direksiyon', 'fren', 'pedal', 'yelken', 'çapa',

  // insan, meslek, vücut
  'doktor', 'öğretmen', 'polis', 'asker', 'hakim', 'avukat', 'mühendis', 'aşçı', 'garson', 'berber',
  'terzi', 'çiftçi', 'balıkçı', 'çoban', 'madenci', 'marangoz', 'demirci', 'fırıncı', 'kasap', 'bakkal',
  'hemşire', 'pilot', 'şoför', 'kaptan', 'ressam', 'şair', 'yazar', 'oyuncu', 'dansçı', 'şarkıcı',
  'kafa', 'saç', 'kulak', 'burun', 'ağız', 'dil', 'boyun', 'omuz', 'kol', 'parmak',
  'bacak', 'ayak', 'topuk', 'sırt', 'karın', 'kemik', 'kan', 'deri', 'tırnak', 'kaş',

  // soyut ve çeşitli
  'zaman', 'gün', 'gece', 'sabah', 'akşam', 'hafta', 'mevsim', 'bahar', 'kış', 'sonbahar',
  'düğün', 'bayram', 'hediye', 'sır', 'yalan', 'rüya', 'korku', 'sevgi', 'öfke', 'kahkaha',
  'söz', 'şarkı', 'masal', 'destan', 'bilmece', 'şaka', 'oyun', 'kural', 'ceza', 'ödül',
  'harita', 'pusula', 'dürbün', 'mercek', 'terazi', 'cetvel', 'kalem', 'silgi', 'defter', 'kitap',
  'gazete', 'mektup', 'zarf', 'pul', 'imza', 'mühür', 'bayrak', 'davul', 'zurna', 'keman',
  'gitar', 'piyano', 'flüt', 'nota', 'sahne', 'koro', 'maske', 'kostüm', 'taç', 'yüzük',
  'kolye', 'bilezik', 'elmas', 'altın', 'gümüş', 'bakır', 'demir', 'çelik', 'cam', 'plastik',
  'kağıt', 'tahta', 'kumaş', 'yün', 'ipek', 'pamuk', 'keten', 'lastik', 'çimento', 'tuğla',

  // yapılar ve yerler
  'okul', 'hastane', 'kütüphane', 'müze', 'tiyatro', 'sinema', 'stadyum', 'havuz', 'hamam', 'çeşme',
  'kule', 'kale', 'saray', 'kilise', 'cami', 'mezarlık', 'pazar', 'dükkan', 'fabrika', 'depo',
  'çiftlik', 'ahır', 'kümes', 'kuyu', 'değirmen', 'fener', 'karakol', 'kışla', 'hapishane', 'sınır',

  // teknoloji ve iş
  'telefon', 'bilgisayar', 'ekran', 'klavye', 'kablo', 'pil', 'ampul', 'sigorta', 'fiş', 'priz',
  'radyo', 'kamera', 'fotoğraf', 'film', 'hoparlör', 'disk', 'anten', 'sinyal', 'şifre', 'virüs',
  'para', 'banka', 'kasa', 'fatura', 'vergi', 'borç', 'faiz', 'hisse', 'sözleşme', 'toplantı',

  // oyun ve spor
  'futbol', 'basketbol', 'voleybol', 'tenis', 'güreş', 'boks', 'yüzme', 'koşu', 'satranç', 'tavla',
  'iskambil', 'zar', 'kupa', 'madalya', 'korner', 'file', 'raket', 'sopa', 'düdük', 'saha',
]

/** 25 rastgele kelime — aynı kelime iki kez gelmez. */
export function drawBoard(count = 25): string[] {
  const unique = [...new Set(CODENAMES_TR)]
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[unique[i], unique[j]] = [unique[j], unique[i]]
  }
  return unique.slice(0, count)
}

export const WORD_COUNT = new Set(CODENAMES_TR).size
