// Türkçe genel kültür soru bankası + sayı tahmini bankası.
// Şoför konsolundan tek tıkla rotaya eklenir; kendi sorularını da yazabilir.

export interface TriviaQuestion {
  prompt: string
  options: string[]
  correct: number
}

export interface NumberQuestion {
  prompt: string
  answer: number
  hint?: string
}

export const TRIVIA_TR: TriviaQuestion[] = [
  { prompt: 'Türkiye’nin en uzun nehri hangisidir?', options: ['Kızılırmak', 'Fırat', 'Sakarya', 'Dicle'], correct: 0 },
  { prompt: '“Tutunamayanlar” romanının yazarı kimdir?', options: ['Oğuz Atay', 'Yusuf Atılgan', 'Sabahattin Ali', 'Ahmet Hamdi Tanpınar'], correct: 0 },
  { prompt: 'Hangi gezegen Güneş’e en yakındır?', options: ['Venüs', 'Merkür', 'Mars', 'Dünya'], correct: 1 },
  { prompt: 'HTTP durum kodu 418 ne anlama gelir?', options: ['Sunucu hatası', 'Erişim engellendi', 'Ben bir çaydanlığım', 'Zaman aşımı'], correct: 2 },
  { prompt: 'Git’i kim yazdı?', options: ['Guido van Rossum', 'Linus Torvalds', 'Brendan Eich', 'Ken Thompson'], correct: 1 },
  { prompt: 'Türkiye’nin yüzölçümü bakımından en büyük ili?', options: ['Sivas', 'Konya', 'Ankara', 'Erzurum'], correct: 1 },
  { prompt: 'Bir “byte” kaç bittir?', options: ['4', '8', '16', '32'], correct: 1 },
  { prompt: 'Dünyanın en derin noktası?', options: ['Mariana Çukuru', 'Tonga Çukuru', 'Java Çukuru', 'Puerto Riko Çukuru'], correct: 0 },
  { prompt: 'SQL’de satırları gruplamak için hangi ifade kullanılır?', options: ['ORDER BY', 'GROUP BY', 'HAVING', 'PARTITION'], correct: 1 },
  { prompt: 'Nobel Edebiyat Ödülü alan ilk Türk yazar?', options: ['Yaşar Kemal', 'Orhan Pamuk', 'Nazım Hikmet', 'Elif Şafak'], correct: 1 },
  { prompt: 'Hangisi bir NoSQL veritabanı değildir?', options: ['MongoDB', 'Redis', 'PostgreSQL', 'Cassandra'], correct: 2 },
  { prompt: 'Ay’a ilk ayak basan insan?', options: ['Buzz Aldrin', 'Neil Armstrong', 'Yuri Gagarin', 'Michael Collins'], correct: 1 },
  { prompt: '“Kırmızı Pazartesi” hangi yazarın eseri?', options: ['Gabriel García Márquez', 'Jorge Luis Borges', 'Pablo Neruda', 'Mario Vargas Llosa'], correct: 0 },
  { prompt: 'TCP’nin açılımındaki “C” nedir?', options: ['Connection', 'Control', 'Client', 'Cluster'], correct: 1 },
  { prompt: 'Türkiye kaç ilden oluşur?', options: ['79', '80', '81', '82'], correct: 2 },
  { prompt: 'Hangisi bir programlama dili değildir?', options: ['Rust', 'Kotlin', 'Docker', 'Elixir'], correct: 2 },
  { prompt: 'En kalabalık şehri Türkiye’nin başkenti sanılan şehir?', options: ['İzmir', 'İstanbul', 'Bursa', 'Antalya'], correct: 1 },
  { prompt: 'Kaç dakikada bir tam daire 360 dereceyi tamamlar (saatin yelkovanı)?', options: ['30', '60', '90', '120'], correct: 1 },
  { prompt: 'RSA şifrelemesi hangi matematiksel zorluğa dayanır?', options: ['Ayrık logaritma', 'Büyük sayı çarpanlara ayırma', 'Eliptik eğriler', 'Hash çakışması'], correct: 1 },
  { prompt: 'Dünyanın en çok konuşulan ana dili?', options: ['İngilizce', 'İspanyolca', 'Mandarin Çincesi', 'Hintçe'], correct: 2 },
]

export const NUMBERS_TR: NumberQuestion[] = [
  { prompt: 'Türkiye’nin nüfusu kaç milyon? (yaklaşık)', answer: 85 },
  { prompt: 'İstanbul Boğazı’nın en dar yeri kaç metre?', answer: 700 },
  { prompt: 'Bir insan kalbi günde ortalama kaç kez atar?', answer: 100000 },
  { prompt: 'Ay ile Dünya arasındaki ortalama uzaklık kaç bin km?', answer: 384 },
  { prompt: 'Everest Dağı kaç metre yüksekliğinde?', answer: 8849 },
  { prompt: 'Bir yılda kaç saniye var? (yaklaşık, milyon olarak)', answer: 31.5 },
  { prompt: 'Dünyada kaç ülke var (BM üyesi)?', answer: 193 },
  { prompt: 'Bir A4 kağıdın uzun kenarı kaç mm?', answer: 297 },
  { prompt: 'Işık saniyede kaç bin km yol alır?', answer: 300 },
  { prompt: 'Türkiye’de kaç UNESCO Dünya Mirası alanı var?', answer: 21 },
]

/** Takım hakkında sorular — şoför toplantı öncesi doldurur. */
export const TEAM_QUESTION_IDEAS = [
  'Bu yıl en çok hangi araca/servise küfrettik?',
  'Standup’ta en çok “bloke oldum” diyen kim?',
  'Hangi ekip üyesi en çok kahve içiyor?',
  'İlk kim işe alındı?',
  'Bu yıl kaç kere prod’a acil müdahale ettik?',
]
