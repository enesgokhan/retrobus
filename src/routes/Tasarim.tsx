import { useState } from 'react'
import Button from '../components/ui/Button'
import { List, Row } from '../components/ui/List'
import { Field, TextArea } from '../components/ui/Field'
import Segmented from '../components/ui/Segmented'
import Sheet from '../components/ui/Sheet'
import Empty from '../components/ui/Empty'
import Alert from '../components/ui/Alert'
import Menu, { MenuItem, MenuSeparator } from '../components/ui/Menu'
import { stageTheme, themeVars } from '../lib/theme'
import type { StageKind } from '../lib/types'

/**
 * The design system, rendered.
 *
 * Every component in every state on one page, so the system can be judged as a
 * system — and so a regression in it is visible in a single screenshot instead
 * of being discovered on the one screen that happened to use the broken state.
 *
 * This is the piece that was missing. Seven batches of design work went in
 * without one place to look at the result, which is how the app ended up with
 * three sizes for the same idea and four implementations of a list.
 *
 * Not linked from anywhere. It is a workbench, at /tasarim.
 */

const TINTS: { kind: StageKind; label: string }[] = [
  { kind: 'board', label: 'Tartışma' },
  { kind: 'wordcloud', label: 'Buz kırıcı' },
  { kind: 'quiz', label: 'Oyun' },
  { kind: 'feedback_wall', label: 'Geri bildirim' },
  { kind: 'leaderboard', label: 'Final' },
  { kind: 'break', label: 'Mola' },
]

const RAMP: { cls: string; name: string; px: string; job: string }[] = [
  { cls: 'text-display', name: 'Display', px: '64', job: 'yansıtılan ekran' },
  { cls: 'text-title-1', name: 'Title 1', px: '40', job: 'bir an — skor, kazanan' },
  { cls: 'text-title-2', name: 'Title 2', px: '28', job: 'ekran başlığı' },
  { cls: 'text-title-3', name: 'Title 3', px: '22', job: 'bölüm başlığı' },
  { cls: 'text-headline', name: 'Headline', px: '17', job: 'satır başlığı' },
  { cls: 'text-body', name: 'Body', px: '17', job: 'odanın yazdıkları' },
  { cls: 'text-callout', name: 'Callout', px: '16', job: 'ikincil metin' },
  { cls: 'text-subhead', name: 'Subhead', px: '15', job: 'destek metni' },
  { cls: 'text-footnote', name: 'Footnote', px: '13', job: 'sayaç, tarih' },
  { cls: 'text-caption', name: 'Caption', px: '12', job: 'etiket' },
  { cls: 'text-overline', name: 'Overline', px: '11', job: 'grup başlığı' },
]

export default function Tasarim() {
  const [kind, setKind] = useState<StageKind>('quiz')
  const [seg, setSeg] = useState('a')
  const [sheet, setSheet] = useState(false)
  const [text, setText] = useState('')

  return (
    <div className="min-h-dvh" style={themeVars(stageTheme(kind))}>
      <header className="sticky top-0 z-20 material border-b border-sep">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between gap-4">
          <span className="text-headline">Retrobüs · Tasarım</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {TINTS.map((t) => (
              <button
                key={t.kind}
                onClick={() => setKind(t.kind)}
                className={kind === t.kind ? 'chip-on' : 'chip'}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: stageTheme(t.kind).tint }}
                  aria-hidden
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-14">
        <Block
          n="01"
          title="Tip merdiveni"
          note="On bir boy, her birinin bir işi var. Yeni bir metin bunlardan birine sığmıyorsa çözüm on ikinciyi eklemek değil, metni yeniden düşünmek."
        >
          <div className="list-group">
            {RAMP.map((r) => (
              <div key={r.cls} className="list-row items-baseline">
                <span className="w-24 shrink-0 text-caption text-label-3 nums">
                  {r.name} · {r.px}
                </span>
                <span className={[r.cls, 'flex-1 min-w-0 truncate'].join(' ')}>
                  Otobüs kalkıyor
                </span>
                <span className="text-caption text-label-3 hidden sm:block">{r.job}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block
          n="02"
          title="Yüzeyler"
          note="Yükseklik açıklıkla kodlanır: öne geldikçe açılır. Ayırıcı çizgi bir rötuş, ayrımı yapan şey değil."
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['bg', 'Sayfa', 'bg-bg'],
              ['bg-1', 'Kart', 'bg-bg-1'],
              ['bg-2', 'Yükseltilmiş', 'bg-bg-2'],
              ['bg-3', 'Sayfanın önü', 'bg-bg-3'],
            ].map(([tok, label, cls]) => (
              <div key={tok} className={[cls, 'rounded-md p-4 hairline'].join(' ')}>
                <div className="text-headline">{label}</div>
                <div className="text-caption text-label-3 mt-0.5">{tok}</div>
              </div>
            ))}
          </div>
        </Block>

        <Block
          n="03"
          title="Metin seviyeleri"
          note="Dört dikkat seviyesi. İlkinden sonrası yarı saydam, böylece metin altındaki her yüzeye uyar."
        >
          <div className="card flex flex-col gap-2">
            <p className="text-body text-label">Birincil — okunacak olan</p>
            <p className="text-body text-label-2">İkincil — destekleyen</p>
            <p className="text-body text-label-3">Üçüncül — üstveri</p>
            <p className="text-body text-label-4">Dördüncül — devre dışı</p>
          </div>
        </Block>

        <Block
          n="04"
          title="Düğmeler"
          note="Görünüm ne kadar istediğini söyler. Bir ekranda aynı anda YALNIZCA bir dolu düğme olur."
        >
          <div className="flex flex-col gap-5">
            {(['lg', 'md', 'sm'] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-2">
                <span className="w-8 text-caption text-label-3 nums">{size}</span>
                <Button variant="filled" size={size}>Başlat</Button>
                <Button variant="tinted" size={size}>Göster</Button>
                <Button variant="gray" size={size}>Vazgeç</Button>
                <Button variant="plain" size={size}>Atla</Button>
                <Button variant="danger" size={size}>Sil</Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-8 text-caption text-label-3">—</span>
              <Button variant="filled" disabled>Devre dışı</Button>
              <Button variant="filled" busy>Gönderiliyor</Button>
              <Button variant="gray" disabled>Devre dışı</Button>
            </div>
          </div>
        </Block>

        <Block n="05" title="Listeler" note="Ayırıcı çizgi metnin başladığı yerden başlar — bir listeyi kurulmuş gösteren ayrıntı bu.">
          <div className="grid sm:grid-cols-2 gap-6">
            <List title="Yolcular" footer="Odaya katılan herkes burada görünür.">
              <Row leading="🦊" title="Enes" subtitle="Şoför" trailing="şimdi" />
              <Row leading="🐼" title="Gal1" subtitle="Yolcu" trailing="2 dk" />
              <Row leading="🐙" title="Uzun bir yolcu adı burada" subtitle="Yolcu" trailing="5 dk" />
            </List>
            <List title="Ayarlar" action={<Button variant="plain" size="sm">Ekle</Button>}>
              <Row title="Anonim yanıtlar" trailing="Açık" chevron onClick={() => {}} />
              <Row title="Süre" trailing="3 dk" chevron onClick={() => {}} />
              <Row title="Seçili satır" trailing="—" selected onClick={() => {}} />
              <Row title="Devre dışı satır" trailing="—" disabled onClick={() => {}} />
            </List>
          </div>
        </Block>

        <Block n="06" title="Alanlar" note="Alan çukurdur, düğme kabarık. Bastığın her şey yükselir, doldurduğun her şey gömülür.">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <Field label="Adın" placeholder="örn. Enes" />
              <Field label="Oda kodu" placeholder="ABCD12" defaultValue="7K2M9Q" />
              <Field label="Hata durumu" defaultValue="xx" error="Bu isim alınmış." />
            </div>
            <TextArea
              label="Bir şey yaz"
              placeholder="Aklına geleni yaz…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              hint="Yazdığın anda herkes görür."
            />
          </div>
        </Block>

        <Block n="07" title="Seçiciler">
          <div className="flex flex-wrap items-center gap-6">
            <Segmented
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'a', label: 'Oda' },
                { value: 'b', label: 'Sunum' },
                { value: 'c', label: 'Yıllık' },
              ]}
            />
            <div className="flex gap-2">
              <span className="chip-on">Seçili</span>
              <span className="chip">Seçili değil</span>
            </div>
            <div className="flex gap-2">
              <span className="badge">3 oy</span>
              <span className="badge-tinted">Canlı</span>
            </div>
          </div>
        </Block>

        <Block n="08" title="Kartlar">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card">
              <div className="text-headline">Normal</div>
              <p className="text-subhead text-label-2 mt-1">Grup içeriği için taban yüzey.</p>
            </div>
            <div className="card-raised">
              <div className="text-headline">Yükseltilmiş</div>
              <p className="text-subhead text-label-2 mt-1">Bir seviye öne çıkan.</p>
            </div>
            <div className="card-tinted">
              <div className="text-headline">Renkli</div>
              <p className="text-subhead text-label-2 mt-1">Ekranın o anki tek vurgusu.</p>
            </div>
          </div>
        </Block>

        <Block n="09" title="Boş durumlar" note="Ne olduğunu söyle, sırada ne olduğunu söyle, çözecek kişiye çözümü ver.">
          <div className="card-lg">
            <Empty
              icon="🎙️"
              title="Henüz soru yok"
              body="İlk soruyu ekle, oda hazır olduğunda hep birlikte başlayalım."
              action={<Button variant="filled" onClick={() => setSheet(true)}>Soru ekle</Button>}
              hint="Enter ile de ekleyebilirsin."
            />
          </div>
        </Block>

        <Block
          n="10"
          title="Uyarılar"
          note="Hata sistemle ilgilidir, oyunla değil — bu yüzden asla durağın rengini kullanmaz."
        >
          <div className="flex flex-col gap-2 max-w-2xl">
            <Alert>Gönderilemedi, tekrar dene.</Alert>
            <Alert tone="warn">Bu durak için henüz soru eklenmemiş.</Alert>
            <Alert tone="info">Katılım kapalı — yeni kimse giremez.</Alert>
          </div>
        </Block>

        <Block n="11" title="Menü" note="Barda yeri olmayan ama ulaşılması gereken her şey.">
          <Menu
            label="Menü"
            trigger={
              <>
                <span aria-hidden className="text-base leading-none">🦊</span>
                <span>Enes</span>
              </>
            }
          >
            {(close) => (
              <>
                <MenuItem onClick={close} trailing="•">Yolcular</MenuItem>
                <MenuItem onClick={close}>Kurallar</MenuItem>
                <MenuItem onClick={close}>Profil</MenuItem>
                <MenuSeparator />
                <MenuItem tone="danger" onClick={close}>Çıkış</MenuItem>
              </>
            )}
          </Menu>
        </Block>

        <Block n="12" title="Katman" note="Arkadaki bağlam görünür kalır; Esc, arka plan ve düğme aynı yere döndürür.">
          <Button variant="tinted" onClick={() => setSheet(true)}>Katmanı aç</Button>
        </Block>
      </main>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Soru ekle"
        subtitle="Bu tur için bir soru ve doğru cevap."
        footer={
          <>
            <Button variant="gray" onClick={() => setSheet(false)}>Vazgeç</Button>
            <Button variant="filled" onClick={() => setSheet(false)}>Ekle</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Soru" placeholder="Örneğin: Ofiste en çok kim kahve içer?" />
          <Field label="Doğru cevap" placeholder="Cevap" />
          <List title="Bu turdaki sorular">
            <Row title="En çok kim geç kalır?" trailing="4 yanıt" />
            <Row title="İlk kim ayrılır?" trailing="2 yanıt" />
          </List>
        </div>
      </Sheet>
    </div>
  )
}

function Block({
  n,
  title,
  note,
  children,
}: {
  n: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <span className="text-overline uppercase text-label-3 nums">{n}</span>
        <h2 className="text-title-3">{title}</h2>
      </div>
      {note && <p className="text-subhead text-label-2 max-w-2xl -mt-2 leading-relaxed">{note}</p>}
      {children}
    </section>
  )
}
