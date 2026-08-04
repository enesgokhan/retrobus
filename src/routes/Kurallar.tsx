import { useState } from 'react'
import AppShell from '../components/AppShell'

interface RuleCard {
  key: string
  emoji: string
  title: string
  oneLine: string
  /** how it actually works, in order */
  steps: string[]
  /** scoring, stated exactly as the app computes it */
  scoring: string[]
  /** rules people get wrong */
  gotchas?: string[]
  /** where the rules come from, when it is a real published game */
  source?: string
}

const RULES: RuleCard[] = [
  {
    key: 'codenames',
    emoji: '🕵️',
    title: 'Kelime Ajanları',
    oneLine: 'İki takım, 25 kelime. Spymaster tek kelimeyle kendi ajanlarını işaret eder.',
    steps: [
      'İki takım kurulur, her takımda bir spymaster olur.',
      'Spymaster’lar 25 kelimenin kime ait olduğunu gösteren anahtarı görür — kimse başka göremez.',
      'Sıradaki spymaster TEK kelime ipucu + bir sayı verir: “meyve 2”.',
      'Takımı sırayla kelimelere basar. Kendi renklerini bulduysa devam eder.',
      'Yanlış kelime sırayı bitirir. Suikastçıya basan takım anında kaybeder.',
    ],
    scoring: ['Kazanan takımın her üyesi 1500 puan.'],
    gotchas: [
      'İpucu tahtada duran bir kelime olamaz (açılmış kartlar serbest).',
      'Sayı + 1 kadar tahmin hakkın var: “meyve 2” → 3 tahmin.',
      'Pas geçmeden önce EN AZ BİR tahmin yapmak zorundasın.',
      '“Sınırsız” seçilirse yanlış yapana kadar tahmin edebilirsin.',
    ],
    source: 'Codenames resmi kural kitabı',
  },
  {
    key: 'wavelength',
    emoji: '📻',
    title: 'Frekans',
    oneLine: 'Gizli bir nokta, tek kelimelik bir ipucu ve iki takım.',
    steps: [
      'Aktif takımın medyumu 0-100 arasındaki gizli hedefi görür.',
      'Spektrumun iki ucu arasında TEK kelimelik bir ipucu verir (örn. soğuk ↔ sıcak).',
      'Aktif takımın her üyesi kendi kadranını koyar; takımın kadranı bunların MEDYANI olur.',
      'Sonra KARŞI TAKIM, gerçek merkezin kadranın solunda mı sağında mı olduğuna bahse girer.',
      'Hedef açılır ve iki takım da puan alabilir.',
    ],
    scoring: [
      'Kadran hedefin 5 birimi içindeyse 1000, 12 içindeyse 750, 20 içindeyse 500 puan.',
      'Puanı aktif takımın tamamı + medyum alır.',
      'Doğru sol/sağ bahsi yapan her kişi 250 puan.',
    ],
    gotchas: [
      'Medyum tahmin etmez, kadran koymaz.',
      'Kadranı yalnızca aktif takım koyar; bahsi yalnızca karşı takım yapar.',
      'Uzaktan uyarlama: gerçek oyunda takım tek kadranı tartışarak oynar, burada herkes kendi kadranını koyar ve medyan alınır — görüntülü görüşmede tek kadranı bir kişinin sürüklemesi kötü çalışıyor.',
    ],
    source: 'Wavelength (CMYK) resmi kuralları',
  },
  {
    key: 'fibbage',
    emoji: '🤫',
    title: 'Fibbage',
    oneLine: 'Gerçek cevabı bul, bu arada kendi yalanınla başkalarını kandır.',
    steps: [
      'Bir soru gösterilir; gerçek cevap gizli.',
      'Herkes inandırıcı bir YALAN yazar.',
      'Bütün yalanlar + gerçek cevap karışık listelenir.',
      'Herkes hangisinin gerçek olduğunu seçer. Kendi yalanını seçemezsin.',
    ],
    scoring: [
      'Gerçeği bulmak: 1000 puan.',
      'Kandırdığın her kişi için: 500 puan.',
      'Sonraki turlar daha değerli (×2, ×3) — şoför ayarlar.',
    ],
    gotchas: [
      'Aynı yalanı iki kişi yazamaz; ikincisi başka bir şey düşünmek zorunda.',
      'Gerçek cevabı yalan olarak yazamazsın.',
    ],
    source: 'Jackbox Fibbage',
  },
  {
    key: 'quiz',
    emoji: '🏆',
    title: 'Bilgi Yarışması',
    oneLine: 'Doğru cevap puan, hızlı doğru cevap daha çok puan.',
    steps: [
      'Şoför soruyu açar, süre başlar.',
      'Cevabını seç — ilk cevabın kesindir, değiştirilemez.',
      'Şoför cevabı açar, puanlar düşer, sıralama görünür.',
    ],
    scoring: [
      'Çoktan seçmeli: 1000 × (1 − geçen süre / süre limiti / 2). Yani en yavaş doğru cevap bile yarım puan alır.',
      'Sayı tahmini: en yakın 1000, ikinci 600, üçüncü 300.',
      'Yanlış cevap 0 — seri/streak çarpanı yok.',
    ],
    gotchas: ['Süre sunucuda ölçülür; “erken cevapladım” demek işe yaramaz.'],
    source: 'Kahoot’un resmi puan formülü',
  },
  {
    key: 'two_truths',
    emoji: '🤥',
    title: 'İki Doğru Bir Yalan',
    oneLine: 'Üç cümle yaz, biri yalan olsun.',
    steps: [
      'Herkes kendisi hakkında üç cümle yazar ve hangisinin yalan olduğunu işaretler.',
      'Şoför sırayla bir kişinin kartını açar.',
      'Oda yalanı tahmin eder, sonra açılır.',
    ],
    scoring: ['Doğru tahmin: 2 puan.', 'Kandırdığın her kişi için: 1 puan.'],
    gotchas: ['Kendi kartını tahmin edemezsin.', 'Yalanını sen açana kadar kimse göremez — şoför bile.'],
  },
  {
    key: 'rank',
    emoji: '🔢',
    title: 'Sırala Bakalım',
    oneLine: 'Listeyi sırala — amaç haklı olmak değil, çoğunlukla aynı düşünmek.',
    steps: [
      'Bir liste verilir (örn. pizza, burger, lahmacun).',
      'Herkes gizlice kendi sırasını yapar.',
      'Açılışta odanın ortak sıralaması çıkar.',
    ],
    scoring: ['Ortak sıralamaya en yakın olan 1000’e kadar puan alır; en uzak olan 100 alır.'],
    gotchas: ['Bu oyunda sıralamalar isimli — puan tablosu için gerekli.'],
    source: 'Herd Mentality ailesi',
  },
  {
    key: 'wordcloud',
    emoji: '☁️',
    title: 'Kelime Bulutu',
    oneLine: 'Tek kelime yaz; aynı kelimeler büyür.',
    steps: ['Geçen dönemi anlatan tek kelimeyi yaz.', 'Aynı kelimeyi yazan ne kadar çoksa o kelime o kadar büyür.'],
    scoring: ['Puan yok — ısınma turu.'],
  },
  {
    key: 'health',
    emoji: '🩺',
    title: 'Takım Nabzı',
    oneLine: 'Her boyut için iyi / orta / kötü. Tamamen anonim.',
    steps: ['Her başlık için bir seçenek işaretle.', 'Herkes bitirince toplu dağılım açılır.'],
    scoring: ['Puan yok.'],
    gotchas: ['Kim ne oyladı hiçbir yerde tutulmuyor — tabloda yazar kolonu yok.'],
  },
  {
    key: 'feedback',
    emoji: '💌',
    title: 'Geri Bildirim Duvarı',
    oneLine: 'Takım arkadaşların için güçlü yön ve gelişim alanı. Anonim.',
    steps: [
      'Kişi seç, tür seç, yaz.',
      'Yazılanlar toplanırken KİMSE göremez — şoför de dahil.',
      'Şoför açtığında hepsi aynı anda, karışık sırayla görünür.',
    ],
    scoring: ['Puan yok.'],
    gotchas: [
      'Toplu açılış bilinçli: kartlar tek tek düşerse kimin yazmak için sustuğuna bakılarak yazar tahmin edilir.',
      'Kişi başına tür başına en fazla 2 kart — kimse yığına maruz kalmasın.',
    ],
  },
  {
    key: 'mission',
    emoji: '🕶️',
    title: 'Gizli Görev',
    oneLine: 'Toplantı boyunca arka planda çalışan gizli bir hedef.',
    steps: [
      'Toplantının başında herkese gizli bir görev verilir.',
      'Kimse kimsenin görevini bilmez — şoför de bilmez.',
      'Finalde hepsi açılır ve başaranlar puan alır.',
    ],
    scoring: ['Başarılan görev: 800 puan.'],
  },
]

/** Oyun kuralları — toplantı sırasında kimse kural anlatmakla uğraşmasın. */
export default function Kurallar() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <AppShell
      title="Oyun kuralları"
      subtitle="Gerçek oyunların resmi kurallarına göre. Uyarlama yaptığımız yerleri açıkça yazdık."
      width="reading"
    >

      <div className="flex flex-col gap-2">
        {RULES.map((r) => {
          const isOpen = open === r.key
          return (
            <section key={r.key} className="card">
              <button
                className="w-full flex items-start gap-3 text-left"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
              >
                <span className="text-3xl shrink-0" aria-hidden>
                  {r.emoji}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold text-lg">{r.title}</span>
                  <span className="block text-sm text-ink-soft">{r.oneLine}</span>
                </span>
                <span className="text-ink-soft shrink-0">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-4 mt-4 pt-4 border-t-2 border-line">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
                      Nasıl oynanır
                    </h3>
                    <ol className="flex flex-col gap-1.5 text-sm">
                      {r.steps.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-extrabold text-coral shrink-0">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
                      Puanlama
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {r.scoring.map((sc, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden className="shrink-0">
                            •
                          </span>
                          <span>{sc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {r.gotchas && (
                    <div className="rounded-2xl bg-amber-soft border-2 border-amber/50 p-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest mb-1.5">
                        Sık karıştırılanlar
                      </h3>
                      <ul className="flex flex-col gap-1.5 text-sm">
                        {r.gotchas.map((g, i) => (
                          <li key={i} className="flex gap-2">
                            <span aria-hidden className="shrink-0">
                              ⚠️
                            </span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.source && (
                    <p className="text-xs text-ink-soft font-semibold">Kaynak: {r.source}</p>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}
