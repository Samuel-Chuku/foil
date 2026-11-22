import { EMPTY_RULES, type ShopRules } from '../capture/shopRules'
import type { MarketId } from '../config/market'
import type { Product } from '../ledger/types'
import {
  SAMPLE_CHATS,
  SAMPLE_DAY,
  SAMPLE_EMAILS,
  SAMPLE_PRODUCTS,
  SAMPLE_SHOP_RULES,
  type SampleChat,
  type SampleEmail,
} from './pack'

// A sample day for each market in the hosted demo. Lagos is the first market;
// Mumbai (UPI) and São Paulo (Pix) show the same desk on other rails. Every
// shop, person, phone number, address and transaction here is invented.

export type SamplePack = {
  day: string
  shop: string
  // The customer the demo's introduction starts with.
  first: string
  // The vendor's bank, whose alerts fill the sample inbox.
  bank: string
  chats: SampleChat[]
  emails: SampleEmail[]
  products: Product[]
  rules: ShopRules
  // Lagos alone has a bank-app screenshot and a status drop to try.
  extras: boolean
}

const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h, m, s)

const item = (
  id: string,
  name: string,
  price: number,
  qty: number | null,
): Product => ({
  id: `sample-${id}`,
  name,
  // Rounded: 189.9 × 100 is not exactly 18990 in floating point.
  priceKobo: Math.round(price * 100),
  qty,
  countedAt: 0,
  updatedAt: 0,
})

// ---------------------------------------------------------------- Mumbai

const HDFC = 'alerts@hdfc.bank.example'
const ICICI = 'alerts@icici.bank.example'

const UPI_LABELS = {
  title: 'Payment successful',
  sender: 'From',
  recipient: 'Paid to',
  recipientBank: 'Credited to',
  sessionId: 'UPI transaction ID',
  reference: 'App transaction ID',
  date: 'Date and time',
}

const MUMBAI_CHATS: SampleChat[] = [
  {
    id: 'priya',
    contactName: 'Priya',
    phone: '+91 90000 00001',
    expected: 'matched',
    messages: [
      {
        id: 'p1',
        from: 'customer',
        time: '14:20',
        text: 'Hi! Is the indigo cotton kurta available in M?',
      },
      {
        id: 'p2',
        from: 'vendor',
        time: '14:22',
        text: 'Hi Priya, yes, M is available. It is ₹1,299.',
      },
      {
        id: 'p3',
        from: 'customer',
        time: '14:25',
        text: 'Great, I will take it with the matching dupatta.',
      },
      {
        id: 'p4',
        from: 'vendor',
        time: '14:26',
        text: 'The dupatta is ₹499, so ₹1,798 in total. Where should we deliver?',
      },
      {
        id: 'p5',
        from: 'customer',
        time: '14:30',
        text: 'Flat 302, Sea View Apartments, Pali Hill, Bandra West. Near the bakery.',
      },
      {
        id: 'p6',
        from: 'customer',
        time: '14:41',
        receipt: {
          issuer: 'GPay',
          amountText: '₹1,798',
          statusText: 'Completed',
          sender: 'PRIYA SHARMA',
          recipient: 'KESAR THREADS',
          recipientBank: 'HDFC Bank',
          sessionId: '632514789012',
          reference: 'CICAgOCx8pKlZQ',
          dateTime: '21 Nov 2026, 2:41 pm',
          labels: UPI_LABELS,
        },
      },
      {
        id: 'p7',
        from: 'customer',
        time: '14:41',
        text: 'Paid! Please check.',
      },
    ],
  },
  {
    id: 'rahul',
    contactName: 'Rahul M',
    phone: '+91 90000 00002',
    expected: 'not yet credited',
    messages: [
      {
        id: 'r1',
        from: 'customer',
        time: '14:50',
        text: 'Hello, the silver jhumkas, are they still there? I can pick up today.',
      },
      {
        id: 'r2',
        from: 'vendor',
        time: '14:52',
        text: 'Yes Rahul, ₹799. You can pick up from the shop till 8 pm.',
      },
      {
        id: 'r3',
        from: 'customer',
        time: '15:05',
        receipt: {
          issuer: 'PhonePe',
          amountText: '₹799',
          statusText: 'Transaction Successful',
          sender: 'RAHUL MEHTA',
          recipient: 'KESAR THREADS',
          recipientBank: 'HDFC Bank',
          sessionId: '632514790345',
          reference: 'T2611211505123456',
          dateTime: '21 Nov 2026, 3:05 pm',
          labels: UPI_LABELS,
        },
      },
      {
        id: 'r4',
        from: 'customer',
        time: '15:06',
        text: 'Sent. I will come at 6.',
      },
    ],
  },
  {
    id: 'ananya',
    contactName: 'Ananya',
    phone: '+91 90000 00003',
    expected: 'check',
    messages: [
      {
        id: 'n1',
        from: 'customer',
        time: '15:00',
        text: 'Hi, I want the maroon cotton saree. ₹2,499 right?',
      },
      {
        id: 'n2',
        from: 'vendor',
        time: '15:02',
        text: 'Yes, ₹2,499. Delivery to Andheri is ₹120.',
      },
      {
        id: 'n3',
        from: 'customer',
        time: '15:04',
        text: 'Okay, Andheri East, Marol, near the metro station. I will pick it up myself actually.',
      },
      {
        id: 'n4',
        from: 'customer',
        time: '15:19',
        receipt: {
          issuer: 'Paytm',
          amountText: '₹2,499',
          statusText: 'Paid Successfully',
          sender: 'ANANYA IYER',
          recipient: 'KESAR THREADS',
          recipientBank: 'HDFC Bank',
          sessionId: '632514791178',
          reference: '',
          dateTime: '21 Nov 2026, 3:19 pm',
          labels: UPI_LABELS,
        },
      },
      {
        id: 'n5',
        from: 'customer',
        time: '15:20',
        text: 'Done, my husband paid from his shop account.',
      },
    ],
  },
  {
    id: 'vikram',
    contactName: 'Vikram',
    phone: '+91 90000 00004',
    expected: 'awaiting',
    messages: [
      {
        id: 'v1',
        from: 'customer',
        time: '15:24',
        text: 'Hi ji, the brown leather juttis in size 8, available? How much?',
      },
    ],
  },
]

const MUMBAI_EMAILS: SampleEmail[] = [
  {
    id: 'm1',
    from: HDFC,
    subject: 'You have received Rs.1798.00',
    time: '14:41',
    receivedAt: at(14, 41, 40),
    inSpam: false,
    body: 'Dear Customer, Rs.1798.00 has been credited to your account XX4521 by VPA priya.s@okicici (PRIYA SHARMA) on 21-11-2026 14:41. UPI Ref No 632514789012. Not you? Call the number on the back of your card.',
  },
  {
    id: 'm2',
    from: HDFC,
    subject: 'You have received Rs.2499.00',
    time: '15:19',
    receivedAt: at(15, 19, 30),
    inSpam: false,
    body: 'Dear Customer, INR 2,499.00 has been credited to your account XX4521 on 21-11-2026 15:19 by R K TRADERS. Available balance shown in your app.',
  },
  {
    // Rahul's money lands late, after he has already sent his screenshot.
    id: 'm3',
    later: true,
    from: HDFC,
    subject: 'You have received Rs.799.00',
    time: '15:52',
    receivedAt: at(15, 52, 10),
    inSpam: false,
    body: 'Dear Customer, Rs.799.00 has been credited to your account XX4521 by VPA rahul.m@ybl (RAHUL MEHTA) on 21-11-2026 15:52. UPI Ref No 632514790345.',
  },
  {
    // An ICICI-looking alert, but the shop's account is with HDFC: a sender
    // the desk does not trust.
    id: 'm4',
    from: ICICI,
    subject: 'Credit alert',
    time: '15:10',
    receivedAt: at(15, 10),
    inSpam: true,
    body: 'Rs.5,000.00 credited to your account. Click to verify your KYC.',
  },
]

const MUMBAI_PRODUCTS: Product[] = [
  item('kurta', 'Indigo cotton kurta', 1_299, 6),
  item('dupatta', 'Matching dupatta', 499, 10),
  item('jhumka', 'Silver jhumkas', 799, 4),
  item('saree', 'Maroon cotton saree', 2_499, 2),
  item('jutti', 'Brown leather juttis', 999, 5),
  item('tote', 'Block-print tote bag', 699, 8),
]

const MUMBAI_RULES: ShopRules = {
  ...EMPTY_RULES,
  shopName: 'Kesar Threads',
  methods: ['own-rider', 'courier', 'pickup'],
  areaFees: [
    { area: 'Bandra', feeKobo: 10_000 },
    { area: 'Andheri', feeKobo: 12_000 },
    { area: 'Dadar', feeKobo: 8_000 },
  ],
  pickupAddress: 'Shop 4, Linking Road, Bandra West',
  pickupHours: 'Monday to Saturday, 11am to 8pm',
  paymentWaitMin: 30,
  refundTerms:
    'Exchanges within 7 days if unused with the tag. No refunds on sale items.',
  policies: 'Orders paid before 4pm are delivered the same day within Mumbai.',
}

// ---------------------------------------------------------------- São Paulo

const ITAU = 'alerts@itau.bank.example'

const PIX_LABELS = {
  title: 'Comprovante de transferência',
  sender: 'Pagador',
  recipient: 'Recebedor',
  recipientBank: 'Instituição do recebedor',
  sessionId: 'ID da transação',
  reference: 'Código de autenticação',
  date: 'Data e hora',
}

const SAO_PAULO_CHATS: SampleChat[] = [
  {
    id: 'mariana',
    contactName: 'Mariana',
    phone: '+55 11 90000-0001',
    expected: 'matched',
    messages: [
      {
        id: 'b1',
        from: 'customer',
        time: '14:20',
        text: 'Oi! O vestido floral ainda tem no tamanho M?',
      },
      {
        id: 'b2',
        from: 'vendor',
        time: '14:22',
        text: 'Oi Mariana! Tem sim, fica R$ 189,90.',
      },
      {
        id: 'b3',
        from: 'customer',
        time: '14:25',
        text: 'Quero! E o brinco dourado também.',
      },
      {
        id: 'b4',
        from: 'vendor',
        time: '14:26',
        text: 'O brinco é R$ 59,90, então fica R$ 249,80 no total. Qual o endereço?',
      },
      {
        id: 'b5',
        from: 'customer',
        time: '14:30',
        text: 'Rua dos Pinheiros, 820, apto 52, Pinheiros. Perto da padaria.',
      },
      {
        id: 'b6',
        from: 'customer',
        time: '14:42',
        receipt: {
          issuer: 'Nubank',
          amountText: 'R$ 249,80',
          statusText: 'Pix enviado',
          sender: 'MARIANA SOUZA',
          recipient: 'ATELIÊ LUA',
          recipientBank: 'Itaú',
          sessionId: 'E18236120202611211742aBcD3fGh1Jk',
          reference: '',
          dateTime: '21/11/2026 - 14:42',
          labels: PIX_LABELS,
        },
      },
      { id: 'b7', from: 'customer', time: '14:42', text: 'Pronto, paguei!' },
    ],
  },
  {
    id: 'fernanda',
    contactName: 'Fernanda',
    phone: '+55 11 90000-0002',
    expected: 'mismatch',
    messages: [
      {
        id: 'f1',
        from: 'customer',
        time: '15:05',
        text: 'Oi, quero a bolsa de palha. R$ 129,00 né?',
      },
      {
        id: 'f2',
        from: 'vendor',
        time: '15:06',
        text: 'Isso, R$ 129,00. Pode mandar o Pix.',
      },
      {
        id: 'f3',
        from: 'customer',
        time: '15:16',
        receipt: {
          issuer: 'Itaú',
          amountText: 'R$ 129,00',
          statusText: 'Pix realizado',
          sender: 'FERNANDA LIMA',
          recipient: 'ATELIÊ LUA',
          recipientBank: 'Itaú',
          sessionId: 'E18236120202611211816Qw7Er9Ty2Ui',
          reference: '',
          dateTime: '21/11/2026 - 15:16',
          labels: PIX_LABELS,
        },
      },
      {
        id: 'f4',
        from: 'customer',
        time: '15:16',
        text: 'Mandei, pode enviar hoje?',
      },
    ],
  },
  {
    id: 'beatriz',
    contactName: 'Beatriz',
    phone: '+55 11 90000-0003',
    expected: 'not yet credited',
    messages: [
      {
        id: 'z1',
        from: 'customer',
        time: '15:00',
        text: 'Boa tarde! A sandália rasteira 37 ainda tem?',
      },
      { id: 'z2', from: 'vendor', time: '15:02', text: 'Tem sim, R$ 99,90.' },
      {
        id: 'z3',
        from: 'customer',
        time: '15:20',
        receipt: {
          issuer: 'Bradesco',
          amountText: 'R$ 99,90',
          statusText: 'Pix agendado para 24/11/2026',
          sender: 'BEATRIZ COSTA',
          recipient: 'ATELIÊ LUA',
          recipientBank: 'Itaú',
          sessionId: '',
          reference: '',
          dateTime: '21/11/2026 - 15:20',
          labels: PIX_LABELS,
        },
      },
      {
        id: 'z4',
        from: 'customer',
        time: '15:21',
        text: 'Já paguei, pode separar pra mim?',
      },
    ],
  },
  {
    id: 'lucas',
    contactName: 'Lucas',
    phone: '+55 11 90000-0004',
    expected: 'not yet credited',
    messages: [
      {
        id: 'l1',
        from: 'customer',
        time: '14:55',
        text: 'E aí! Quero duas camisetas básicas pretas, tamanho G. Retiro na loja.',
      },
      {
        id: 'l2',
        from: 'vendor',
        time: '14:57',
        text: 'Fechado, Lucas! Duas por R$ 99,80. Pode retirar até as 19h.',
      },
      {
        id: 'l3',
        from: 'customer',
        time: '15:10',
        receipt: {
          issuer: 'Banco Inter',
          amountText: 'R$ 99,80',
          statusText: 'Pix enviado',
          sender: 'LUCAS PEREIRA',
          recipient: 'ATELIÊ LUA',
          recipientBank: 'Itaú',
          sessionId: 'E00416968202611211810Zx8Cv6Bn4Mq',
          reference: '',
          dateTime: '21/11/2026 - 15:10',
          labels: PIX_LABELS,
        },
      },
      {
        id: 'l4',
        from: 'customer',
        time: '15:11',
        text: 'Pago! Passo aí às 18h.',
      },
    ],
  },
  {
    id: 'gabriel',
    contactName: 'Gabriel',
    phone: '+55 11 90000-0005',
    expected: 'awaiting',
    messages: [
      {
        id: 'g1',
        from: 'customer',
        time: '15:25',
        text: 'Oi! Vocês entregam na Vila Madalena? Quanto fica o frete?',
      },
    ],
  },
]

const SAO_PAULO_EMAILS: SampleEmail[] = [
  {
    id: 's1',
    from: ITAU,
    subject: 'Você recebeu um Pix',
    time: '14:42',
    receivedAt: at(14, 42, 20),
    inSpam: false,
    body: 'Você recebeu um Pix de R$ 249,80 de MARIANA SOUZA em 21/11/2026 às 14:42. ID da transação: E18236120202611211742aBcD3fGh1Jk',
  },
  {
    // The alert email for Lucas's Pix is slow, though the money moved at once.
    id: 's2',
    later: true,
    from: ITAU,
    subject: 'Você recebeu um Pix',
    time: '15:10',
    receivedAt: at(15, 58),
    inSpam: false,
    body: 'Você recebeu um Pix de R$ 99,80 de LUCAS PEREIRA em 21/11/2026 às 15:10. ID da transação: E00416968202611211810Zx8Cv6Bn4Mq',
  },
]

const SAO_PAULO_PRODUCTS: Product[] = [
  item('vestido', 'Vestido floral', 189.9, 3),
  item('brinco', 'Brinco dourado', 59.9, 8),
  item('bolsa', 'Bolsa de palha', 129, 2),
  item('sandalia', 'Sandália rasteira', 99.9, 4),
  item('camiseta', 'Camiseta básica preta', 49.9, 12),
]

const SAO_PAULO_RULES: ShopRules = {
  ...EMPTY_RULES,
  shopName: 'Ateliê Lua',
  methods: ['own-rider', 'courier', 'pickup'],
  areaFees: [
    { area: 'Pinheiros', feeKobo: 1_200 },
    { area: 'Vila Madalena', feeKobo: 1_200 },
    { area: 'Moema', feeKobo: 1_500 },
  ],
  pickupAddress: 'Rua dos Pinheiros, 500 - Pinheiros',
  pickupHours: 'Segunda a sábado, das 10h às 19h',
  paymentWaitMin: 20,
  refundTerms: 'Trocas em até 7 dias, com etiqueta.',
  policies: 'Entregas no mesmo dia para pedidos pagos até as 15h.',
}

// ---------------------------------------------------------------- Packs

export const PACKS: Record<MarketId, SamplePack> = {
  ng: {
    day: SAMPLE_DAY,
    shop: SAMPLE_SHOP_RULES.shopName,
    first: 'Adaeze',
    bank: 'GTBank',
    chats: SAMPLE_CHATS,
    emails: SAMPLE_EMAILS,
    products: SAMPLE_PRODUCTS,
    rules: SAMPLE_SHOP_RULES,
    extras: true,
  },
  in: {
    day: SAMPLE_DAY,
    shop: MUMBAI_RULES.shopName,
    first: 'Priya',
    bank: 'HDFC Bank',
    chats: MUMBAI_CHATS,
    emails: MUMBAI_EMAILS,
    products: MUMBAI_PRODUCTS,
    rules: MUMBAI_RULES,
    extras: false,
  },
  br: {
    day: 'Sábado, 21 de novembro de 2026',
    shop: SAO_PAULO_RULES.shopName,
    first: 'Mariana',
    bank: 'Itaú',
    chats: SAO_PAULO_CHATS,
    emails: SAO_PAULO_EMAILS,
    products: SAO_PAULO_PRODUCTS,
    rules: SAO_PAULO_RULES,
    extras: false,
  },
}
