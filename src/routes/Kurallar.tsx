import { useState } from 'react'
import AppShell from '../components/AppShell'
import Icon from '../components/ui/Icon'

interface RuleCard {
  key: string
  /** the stop kind this rule belongs to, for the icon */
  icon: string
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
    icon: 'codenames',
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
    icon: 'wavelength',
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
    icon: 'fibbage',
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
    icon: 'quiz',
    title: 'Bilgi Yarışması',
    oneLine: 'Doğru cevap puan, hızlı doğru cevap daha çok puan.',
    steps: [
      'Soru açılır, süre başlar.',
      'Cevabını seç — ilk cevabın kesindir, değiştirilemez.',
      'Cevap açılır, puanlar düşer, sıralama görünür.',
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
    icon: 'two_truths',
    title: 'İki Doğru Bir Yalan',
    oneLine: 'Üç cümle yaz, biri yalan olsun.',
    steps: [
      'Herkes kendisi hakkında üç cümle yazar ve hangisinin yalan olduğunu işaretler.',
      'Yöneten sırayla bir kişinin kartını açar.',
      'Oda yalanı tahmin eder, sonra açılır.',
    ],
    scoring: ['Doğru tahmin: 2 puan.', 'Kandırdığın her kişi için: 1 puan.'],
    gotchas: ['Kendi kartını tahmin edemezsin.', 'Yalanını sen açana kadar kimse göremez — şoför bile.'],
  },
  {
    key: 'rank',
    icon: 'rank',
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
    icon: 'wordcloud',
    title: 'Kelime Bulutu',
    oneLine: 'Tek kelime yaz; aynı kelimeler büyür.',
    steps: ['Geçen dönemi anlatan tek kelimeyi yaz.', 'Aynı kelimeyi yazan ne kadar çoksa o kelime o kadar büyür.'],
    scoring: ['Puan yok — ısınma turu.'],
  },
  {
    key: 'health',
    icon: 'health_check',
    title: 'Takım Nabzı',
    oneLine: 'Her boyut için iyi / orta / kötü. Tamamen anonim.',
    steps: ['Her başlık için bir seçenek işaretle.', 'Herkes bitirince toplu dağılım açılır.'],
    scoring: ['Puan yok.'],
    gotchas: ['Kim ne oyladı hiçbir yerde tutulmuyor — tabloda yazar kolonu yok.'],
  },
  {
    key: 'feedback',
    icon: 'feedback_wall',
    title: 'Geri Bildirim Duvarı',
    oneLine: 'Takım arkadaşların için güçlü yön ve gelişim alanı. Anonim.',
    steps: [
      'Kişi seç, tür seç, yaz.',
      'Yazılanlar toplanırken KİMSE göremez — şoför de dahil.',
      'Yöneten açtığında hepsi aynı anda, karışık sırayla görünür.',
    ],
    scoring: ['Puan yok.'],
    gotchas: [
      'Toplu açılış bilinçli: kartlar tek tek düşerse kimin yazmak için sustuğuna bakılarak yazar tahmin edilir.',
      'Kişi başına tür başına en fazla 2 kart — kimse yığına maruz kalmasın.',
    ],
  },
  {
    key: 'mission',
    icon: 'secret_mission',
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

      {/* One group, not eleven cards. A set of things you open one at a time is
          a list; rendering each as its own surface made the page read as
          eleven unrelated panels that happen to be stacked. */}
      <div className="list-group">
        {RULES.map((r) => {
          const isOpen = open === r.key
          return (
            <section key={r.key}>
              <button
                className="list-row-tappable list-row-inset w-full"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
              >
                <span className="shrink-0 size-8 grid place-items-center text-label-2">
                  <Icon name={r.icon} size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-headline">{r.title}</span>
                  <span className="block text-footnote text-label-2 mt-0.5">{r.oneLine}</span>
                </span>
                <svg
                  className={[
                    'shrink-0 size-4 text-label-3 transition-transform duration-200',
                    isOpen ? 'rotate-90' : '',
                  ].join(' ')}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M6 3.5L10.5 8L6 12.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-5 px-4 pb-5 pt-1 animate-fade">
                  <div>
                    <h3 className="eyebrow text-label-3 mb-2">Nasıl oynanır</h3>
                    <ol className="flex flex-col gap-2 text-callout">
                      {r.steps.map((step, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span className="nums text-label-3 shrink-0 tabular-nums">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div>
                    <h3 className="eyebrow text-label-3 mb-2">Puanlama</h3>
                    <ul className="flex flex-col gap-1.5 text-callout">
                      {r.scoring.map((sc, i) => (
                        <li key={i} className="flex gap-2.5">
                          <span aria-hidden className="shrink-0 text-label-4">
                            •
                          </span>
                          <span>{sc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {r.gotchas && (
                    <div
                      className="rounded-md p-3.5"
                      style={{
                        background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)',
                      }}
                    >
                      <h3 className="eyebrow text-warn mb-2">
                        Sık karıştırılanlar
                      </h3>
                      <ul className="flex flex-col gap-1.5 text-callout">
                        {r.gotchas.map((g, i) => (
                          <li key={i} className="flex gap-2.5">
                            <span aria-hidden className="shrink-0 text-label-4">
                              ·
                            </span>
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.source && (
                    <p className="text-footnote text-label-3">Kaynak: {r.source}</p>
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
