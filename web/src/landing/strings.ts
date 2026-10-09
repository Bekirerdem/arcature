import { defineStrings } from "../lib/i18n";

/** Every user-facing landing string, English + Turkish. Eight scenes, one story:
 *  the team earns together, BUT the split lives in a spreadsheet, SO the money goes into a chest
 *  that an agent runs inside rules nobody can bend. */
export const L = defineStrings({
  "l.tagline": ["the guild chest, onchain", "loncanın ortak kasası, zincirde"],
  "l.nav.why": ["Why", "Neden"],
  "l.nav.how": ["How", "Nasıl"],
  "l.nav.rules": ["Rules", "Kurallar"],
  "l.nav.proof": ["Proof", "Kanıt"],
  "l.nav.open": ["Open the app", "Uygulamayı aç"],
  "l.scroll": ["Scroll", "Kaydır"],

  // 1 · opening — the money arrived
  "l.s1.eyebrow": ["For teams that earn together", "Birlikte kazanan ekipler için"],
  "l.s1.l1": ["Three people finished a job.", "Üç kişi bir iş bitirdi."],
  "l.s1.l2": ["The money arrived.", "Para geldi."],
  "l.s1.l3": ["Now the hard part starts.", "Asıl zor kısım şimdi başlıyor."],
  "l.s1.payLabel": ["Incoming · client in Berlin", "Gelen ödeme · Berlin'deki müşteri"],
  "l.s1.payJob": ["Website, phase 2", "Web sitesi, 2. aşama"],
  "l.role.frontend": ["frontend", "ön yüz"],
  "l.role.design": ["design", "tasarım"],
  "l.role.contracts": ["contracts", "kontratlar"],

  // 2 · the problem — one person's spreadsheet
  "l.s2.q1": ["Who gets how much?", "Kim ne kadar alacak?"],
  "l.s2.q2": ["What stays in the chest?", "Kasada ne kalacak?"],
  "l.s2.q3": ["It all lives in one person's spreadsheet.", "Hepsi tek bir kişinin Excel'inde."],
  "l.s2.file": ["split_FINAL_v7.xlsx", "bolusum_SON_v7.xlsx"],
  "l.s2.edited": ["edited 02:14 · by one person", "02:14'te düzenlendi · tek kişi"],
  "l.s2.reserve": ["reserve", "yedek"],
  "l.s2.forgot": ["forgot", "unutuldu"],
  "l.s2.n1": ["Why is my share 40%?", "Payım neden %40?"],
  "l.s2.n2": ["The reserve? We forgot it.", "Yedek mi? Unutmuşuz."],
  "l.s2.n3": ["The client paid three weeks late.", "Müşteri üç hafta geç ödedi."],
  "l.s2.trust": ["trust", "güven"],
  "l.s2.snapped": ["trust · snapped", "güven · koptu"],

  // 3 · the chest — pinned, reserve first, split by the work
  "l.s3.title": ["So the money goes into a chest.", "Bu yüzden para bir kasaya girer."],
  "l.s3.body": [
    "Every payment is pinned to the job that earned it. The reserve comes off first, the rest is split by the work.",
    "Her ödeme, onu kazandıran işe iğnelenir. Önce yedek ayrılır, kalanı emeğe göre bölünür.",
  ],
  "l.s3.invoice": ["Invoice #12 · paid", "Fatura #12 · ödendi"],
  "l.s3.client": ["Berlin client", "Berlin'deki müşteri"],
  "l.s3.matched": ["Pinned to the job", "İşe iğnelendi"],
  "l.s3.reserve": ["Reserve · first", "Yedek · önce"],
  "l.s3.bead.reserve": ["200 · reserve", "200 · yedek"],

  // 4 · the agent at work
  "l.s4.title": ["Bills come in. The agent reads them and pays the ones it knows.", "Faturalar gelir. Ajan okur, tanıdıklarını öder."],
  "l.s4.agent": ["Agent", "Ajan"],
  "l.s4.agentSub": ["reads every bill · pays inside the limits", "her faturayı okur · sınırların içinde öder"],
  "l.s4.b1": ["Figma · design seats", "Figma · tasarım lisansı"],
  "l.s4.b2": ["Hetzner · servers", "Hetzner · sunucular"],
  "l.s4.b3": ["Selin · illustration", "Selin · illüstrasyon"],
  "l.s4.why": ["known payee · usual amount · inside this period's limit", "tanıdık alıcı · olağan tutar · bu dönemin sınırında"],
  "l.s4.paid": ["PAID", "ÖDENDİ"],

  // 5 · the fake bill — bounded by the contract
  "l.s5.lead": ["“Our wallet changed, send the 480 USDC here.” The agent stops.", "“Cüzdanımız değişti, 480 USDC'yi buraya gönderin.” Ajan durur."],
  "l.s5.from": ["From billing@hetzner-invoices.co", "Gönderen billing@hetzner-invoices.co"],
  "l.s5.subject": ["Our wallet changed", "Cüzdanımız değişti"],
  "l.s5.body.a": ["Please send this month's ", "Lütfen bu ayın "],
  "l.s5.body.amt": ["480 USDC", "480 USDC'sini"],
  "l.s5.body.b": [" to our new address ", " yeni adresimize gönderin: "],
  "l.s5.flag1": ["unknown address", "tanınmayan adres"],
  "l.s5.flag2": ["22× the usual amount", "olağanın 22 katı"],
  "l.s5.flag3": ["asks to change the wallet", "cüzdan değiştirmeyi istiyor"],
  "l.s5.verdict": ["Held. Nothing paid. Vote opened.", "Bekletildi. Ödeme yok. Oylama açıldı."],
  "l.s5.held": ["HELD", "BEKLEMEDE"],
  "l.s5.forced": ["even if someone forces the call:", "biri çağrıyı zorlasa bile:"],
  "l.s5.reverted": ["reverted", "reddedildi"],
  "l.s5.chain": ["checked by the contract on Arc", "Arc'taki kontrat kontrol etti"],
  "l.s5.big.a": ["Bounded by the contract,", "Prompt değil,"],
  "l.s5.big.b": ["not the prompt.", "kontrat sınırlar."],

  // 6 · the rules
  "l.s6.title": ["Nobody, not even the agent, moves money alone.", "Kimse, ajan bile, parayı tek başına oynatamaz."],
  "l.s6.proposal": ["Vote #7", "Oylama #7"],
  "l.s6.raise": ["Raise the reserve to 15%", "Yedeği %15'e çıkar"],
  "l.s6.yes": ["YES", "EVET"],
  "l.s6.wait": ["waiting time · 1 day", "bekleme süresi · 1 gün"],
  "l.s6.ready": ["ready to carry out", "uygulanabilir"],
  "l.s6.agentCant": ["The agent can't open rule votes.", "Ajan kural oylaması açamaz."],
  "l.s6.agentCap": ["Its spending stops at the limit members set.", "Harcaması üyelerin koyduğu sınırda durur."],

  // 7 · proof, read live from Arc
  "l.s7.title": ["This isn't a demo. It runs on Arc mainnet.", "Bu bir demo değil. Arc mainnet'te çalışıyor."],
  "l.s7.chests": ["chests opened", "açılan kasa"],
  "l.s7.paid": ["invoices paid", "ödenen fatura"],
  "l.s7.usdc": ["USDC through the proof chest", "kanıt kasasından geçen USDC"],
  "l.s7.payouts": ["payouts made", "yapılan dağıtım"],
  "l.s7.live": ["Read live from Arc just now", "Az önce Arc'tan canlı okundu"],
  "l.s7.offline": ["Arc didn't answer just now; the numbers on the explorer are the same.", "Arc şu an cevap vermedi; explorer'daki sayılar aynı."],
  "l.s7.explorer": ["See the factory on Arc explorer", "Factory'yi Arc explorer'da gör"],

  // 8 · close
  "l.s8.l1": ["Paid for the work you did.", "Emeğin kadar pay."],
  "l.s8.l2": ["Rules nobody can bend.", "Kimsenin bozamadığı kurallar."],
  "l.s8.body": [
    "Open a chest for your team in one transaction. It costs about a cent of USDC.",
    "Ekibin için tek işlemde bir kasa aç. Yaklaşık bir sent USDC tutar.",
  ],
  "l.s8.cta": ["Open a chest", "Kasanı aç"],
  "l.s8.period": ["Period 12", "12. dönem"],
  "l.s8.opens": ["opens today", "bugün açılıyor"],
  "l.foot.a": ["Built on Arc · settled in USDC", "Arc üzerinde · USDC ile"],
  "l.foot.b": ["Keyarc · live on Arc mainnet", "Keyarc · Arc mainnet'te canlı"],
});
