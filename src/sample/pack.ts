import type { ShopRules } from '../capture/shopRules'
import type { Product } from '../ledger/types'
import type { AlertEmail } from '../verify/alerts'
import type { RawHistoryRow } from '../verify/history'
import type { RawReceipt } from '../verify/receiptFields'

// Synthetic sample data for the hosted demo and the tests. Every name, phone
// number, address and transaction here is invented.

// What is printed on a sample receipt. The demo draws it as an image so the
// model reads pixels, exactly as it would a customer's screenshot.
export type SampleReceipt = RawReceipt & { recipientBank: string }

export type SampleMessage = {
  id: string
  from: 'customer' | 'vendor'
  time: string
  text?: string
  receipt?: SampleReceipt
}

export type SampleChat = {
  id: string
  contactName: string
  phone: string
  messages: SampleMessage[]
  // What the engine should conclude, for tests and the evaluation harness.
  // 'awaiting' for a chat with no receipt yet.
  expected: 'matched' | 'not yet credited' | 'mismatch' | 'check' | 'awaiting'
}

// `later`: arrives only when the demo lets time pass, to show what happens
// when an alert lands after the vendor has acted.
export type SampleEmail = AlertEmail & {
  subject: string
  time: string
  later?: boolean
}

export const SAMPLE_DAY = 'Saturday 21 November 2026'
const at = (h: number, m: number, s = 0) => Date.UTC(2026, 10, 21, h, m, s)

export const SAMPLE_CHATS: SampleChat[] = [
  {
    id: 'adaeze',
    contactName: 'Adaeze',
    phone: '+234 800 000 0001',
    expected: 'matched',
    messages: [
      {
        id: 'a1',
        from: 'customer',
        time: '10:48',
        text: 'Good morning. Is the ankara gown in size 14 still available?',
      },
      {
        id: 'a2',
        from: 'vendor',
        time: '10:50',
        text: 'Good morning! Yes, size 14 is available. It is ₦15,000.',
      },
      {
        id: 'a3',
        from: 'customer',
        time: '10:52',
        text: "Okay, I'll take it. Please add one headwrap too.",
      },
      {
        id: 'a4',
        from: 'vendor',
        time: '10:53',
        text: 'The headwrap is ₦3,500, so ₦18,500 in total. Where should we deliver?',
      },
      {
        id: 'a5',
        from: 'customer',
        time: '10:58',
        text: '12 Hughes Avenue, Yaba. Opposite the filling station.',
      },
      {
        id: 'a6',
        from: 'customer',
        time: '11:03',
        receipt: {
          issuer: 'OPay',
          amountText: '₦18,500.00',
          statusText: 'Successful',
          sender: 'ADAEZE OKAFOR',
          recipient: 'SAMPLE STORES',
          recipientBank: 'Guaranty Trust Bank',
          sessionId: '100004261121100212384915207642',
          reference: '261121010200871234',
          dateTime: 'Nov 21, 2026 11:02 AM',
        },
      },
      { id: 'a7', from: 'customer', time: '11:03', text: "I've sent it." },
    ],
  },
  {
    id: 'tunde',
    contactName: 'Tunde B',
    phone: '+234 800 000 0002',
    expected: 'not yet credited',
    messages: [
      {
        id: 't1',
        from: 'customer',
        time: '12:30',
        text: 'Bros abeg the blue jeans wey you post, size 32 dey?',
      },
      { id: 't2', from: 'vendor', time: '12:32', text: 'E dey. ₦12,000.' },
      {
        id: 't3',
        from: 'customer',
        time: '12:35',
        text: 'Oya I go collect am. Send am come 5 Allen Avenue, Ikeja, near the big church.',
      },
      {
        id: 't4',
        from: 'customer',
        time: '12:46',
        receipt: {
          issuer: 'Access Bank',
          amountText: 'NGN 12,000.00',
          statusText: 'Successful',
          sender: 'TUNDE BAKARE',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '000014261121124501730268159843',
          reference: '',
          dateTime: '21/11/2026 12:45',
        },
      },
      {
        id: 't5',
        from: 'customer',
        time: '12:46',
        text: 'Don pay. Abeg send am today.',
      },
    ],
  },
  {
    id: 'chioma',
    contactName: 'Chioma Eze',
    phone: '+234 800 000 0003',
    expected: 'matched',
    messages: [
      {
        id: 'c1',
        from: 'customer',
        time: '13:05',
        text: 'Hi, I want the white sneakers in size 39. ₦9,000, right?',
      },
      { id: 'c2', from: 'vendor', time: '13:06', text: 'Yes ma, ₦9,000.' },
      {
        id: 'c3',
        from: 'customer',
        time: '13:08',
        text: "I'll pick them up at your shop this evening.",
      },
      {
        id: 'c4',
        from: 'customer',
        time: '13:11',
        receipt: {
          issuer: 'GTBank',
          amountText: '₦9,000.00',
          statusText: 'Successful',
          sender: 'CHIOMA EZE',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '',
          reference: '0123456789',
          dateTime: '21 Nov 2026 13:10',
        },
      },
    ],
  },
  {
    // Verify after Adaeze: this is her receipt, forwarded for another order.
    id: 'emeka',
    contactName: 'Emeka',
    phone: '+234 800 000 0004',
    expected: 'mismatch',
    messages: [
      {
        id: 'e1',
        from: 'customer',
        time: '13:40',
        text: 'Good afternoon. I want the brown leather bag, ₦18,500.',
      },
      { id: 'e2', from: 'vendor', time: '13:42', text: 'Available. ₦18,500.' },
      {
        id: 'e3',
        from: 'customer',
        time: '13:47',
        receipt: {
          issuer: 'OPay',
          amountText: '₦18,500.00',
          statusText: 'Successful',
          sender: 'ADAEZE OKAFOR',
          recipient: 'SAMPLE STORES',
          recipientBank: 'Guaranty Trust Bank',
          sessionId: '100004261121100212384915207642',
          reference: '261121010200871234',
          dateTime: 'Nov 21, 2026 11:02 AM',
        },
      },
      {
        id: 'e4',
        from: 'customer',
        time: '13:47',
        text: 'Paid. Please send it to 3 Ogunlana Drive, Surulere.',
      },
    ],
  },
  {
    id: 'bisi',
    contactName: 'Bisi',
    phone: '+234 800 000 0005',
    expected: 'not yet credited',
    messages: [
      {
        id: 'b1',
        from: 'customer',
        time: '13:55',
        text: 'Hello! Do you still have the beaded necklace? How much?',
      },
      { id: 'b2', from: 'vendor', time: '13:57', text: 'Yes, ₦7,000.' },
      {
        id: 'b3',
        from: 'customer',
        time: '14:03',
        receipt: {
          issuer: 'Kuda',
          amountText: '₦7,000.00',
          statusText: 'Successful',
          sender: 'BISI ADEOLA',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '090267261121130205518264093771',
          reference: '',
          dateTime: '21/11/2026 14:02',
        },
      },
      {
        id: 'b4',
        from: 'customer',
        time: '14:03',
        text: 'Sent. I will pick it up tomorrow.',
      },
    ],
  },
  {
    id: 'kemi',
    contactName: 'Kemi J',
    phone: '+234 800 000 0006',
    expected: 'check',
    messages: [
      {
        id: 'k1',
        from: 'customer',
        time: '15:10',
        text: 'Abeg how much for the silk scarf?',
      },
      { id: 'k2', from: 'vendor', time: '15:12', text: '₦5,000.' },
      {
        id: 'k3',
        from: 'customer',
        time: '15:24',
        receipt: {
          issuer: 'PalmPay',
          amountText: '₦5,000.00',
          statusText: 'Successful',
          sender: 'OLUWAKEMI JOHNSON',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '',
          reference: 'PP2611211520000123',
          dateTime: '21/11/2026 15:20',
        },
      },
      {
        id: 'k4',
        from: 'customer',
        time: '15:25',
        text: 'The first one show pending so I send again. Abeg check am. Deliver to 9 Admiralty Way, Lekki.',
      },
      {
        id: 'k5',
        from: 'customer',
        time: '15:26',
        text: 'If e enter twice, abeg refund the extra to my OPay 900 000 0006, Oluwakemi Johnson.',
      },
    ],
  },
  {
    // No alert email came for this transfer; only the bank app shows it.
    id: 'femi',
    contactName: 'Femi',
    phone: '+234 800 000 0007',
    expected: 'matched',
    messages: [
      {
        id: 'f1',
        from: 'customer',
        time: '16:20',
        text: 'Good evening. I need two of the plain black caps. How much?',
      },
      {
        id: 'f2',
        from: 'vendor',
        time: '16:22',
        text: '₦11,000 each, so ₦22,000 for two.',
      },
      {
        id: 'f3',
        from: 'customer',
        time: '16:31',
        receipt: {
          issuer: 'Moniepoint',
          amountText: '₦22,000.00',
          statusText: 'Successful',
          sender: 'FEMI ADEYEMI',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '090405261121163012448302716594',
          reference: '',
          dateTime: '21/11/2026 16:30',
        },
      },
      {
        id: 'f4',
        from: 'customer',
        time: '16:31',
        text: 'Done. Send them to 14 Adeniran Ogunsanya Street, Surulere, by the shopping mall. How much is delivery?',
      },
    ],
  },
  {
    // Pays ₦500 short, then sends the balance as a second transfer.
    id: 'ngozi',
    contactName: 'Ngozi',
    phone: '+234 800 000 0008',
    expected: 'matched',
    messages: [
      {
        id: 'n1',
        from: 'customer',
        time: '17:05',
        text: 'Hi, I want the green ankara gown in size 12 and a matching headwrap.',
      },
      {
        id: 'n2',
        from: 'vendor',
        time: '17:07',
        text: 'The gown is ₦9,500 and the headwrap ₦3,000, so ₦12,500 in total.',
      },
      {
        id: 'n3',
        from: 'customer',
        time: '17:16',
        receipt: {
          issuer: 'UBA',
          amountText: '₦12,000.00',
          statusText: 'Successful',
          sender: 'NGOZI OKONKWO',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '000004261121171503829164730528',
          reference: '',
          dateTime: '21/11/2026 17:15',
        },
      },
      {
        id: 'n4',
        from: 'customer',
        time: '17:16',
        text: 'Sent. Deliver to 4 Bode Thomas Street, Surulere.',
      },
      {
        id: 'n5',
        from: 'vendor',
        time: '17:20',
        text: 'Thank you! ₦12,000 has come in, so ₦500 is left.',
      },
      {
        id: 'n6',
        from: 'customer',
        time: '17:23',
        receipt: {
          issuer: 'UBA',
          amountText: '₦500.00',
          statusText: 'Successful',
          sender: 'NGOZI OKONKWO',
          recipient: 'SAMPLE STORES',
          recipientBank: 'GTBank',
          sessionId: '000004261121172204617382950164',
          reference: '',
          dateTime: '21/11/2026 17:22',
        },
      },
      {
        id: 'n7',
        from: 'customer',
        time: '17:23',
        text: "Sorry about that, I've sent the balance.",
      },
    ],
  },
  {
    // Outside Lagos, with no park chosen yet: the draft offers the parks.
    id: 'halima',
    contactName: 'Halima',
    phone: '+234 800 000 0009',
    expected: 'awaiting',
    messages: [
      {
        id: 'h1',
        from: 'customer',
        time: '17:40',
        text: 'Good evening. I want the black abaya in size M. How much?',
      },
      {
        id: 'h2',
        from: 'vendor',
        time: '17:42',
        text: 'Good evening! The black abaya in M is ₦16,000.',
      },
      {
        id: 'h3',
        from: 'customer',
        time: '17:45',
        text: "I'm in Abuja. Can you send it to me here? How much will it cost?",
      },
    ],
  },
  {
    // Writes "Ph" for Port Harcourt, a state the shop has no park price for.
    id: 'ebi',
    contactName: 'Ebi',
    phone: '+234 800 000 0010',
    expected: 'awaiting',
    messages: [
      {
        id: 'eb1',
        from: 'customer',
        time: '18:02',
        text: 'Hi, how much for the brown leather sandals in size 41?',
      },
      { id: 'eb2', from: 'vendor', time: '18:04', text: '₦9,500.' },
      {
        id: 'eb3',
        from: 'customer',
        time: '18:06',
        text: 'Oya. I dey for Ph, Rumuokoro side. Una fit send am come?',
      },
    ],
  },
  {
    // Asks after an item that sells out once Adaeze's order is paid, and one
    // the shop has already run out of.
    id: 'tola',
    contactName: 'Tola',
    phone: '+234 800 000 0011',
    expected: 'awaiting',
    messages: [
      {
        id: 'to1',
        from: 'customer',
        time: '15:24',
        text: 'Good afternoon. Is the ankara gown in size 14 still available? And how much is the red handbag?',
      },
    ],
  },
]

const GTBANK = 'gens@gtbank.com'

export const SAMPLE_EMAILS: SampleEmail[] = [
  {
    id: 'e1',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 18,500.00]',
    time: '11:02',
    receivedAt: at(11, 2, 30),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    100004261121100212384915207642-ADAEZE OKAFOR
Amount    :    NGN 18500
Value Date    :    2026-11-21
Remarks    :    ADAEZE OKAFOR GOWN
Time of Transaction    :    11:02:30 AM
Document Number    :    10000426112110021200`,
  },
  {
    id: 'e2',
    from: 'alerts@gtbank-notify.com',
    subject: 'Transaction Alert [Credit: NGN 12,000.00]',
    time: '12:47',
    receivedAt: at(12, 47, 5),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    000014261121124501730268159843-TUNDE BAKARE
Amount    :    NGN 12000
Value Date    :    2026-11-21
Time of Transaction    :    12:46:40 PM`,
  },
  {
    // Same-bank alerts can lag; this one arrives after Chioma's receipt.
    id: 'e3',
    later: true,
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 9,000.00]',
    time: '13:11',
    receivedAt: at(13, 11, 20),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    CHIOMA EZE
Amount    :    NGN 9000
Value Date    :    2026-11-21
Remarks    :    SNEAKERS
Time of Transaction    :    01:11:20 PM
Document Number    :    0123456789`,
  },
  {
    id: 'e4',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 7,000.00]',
    time: '14:02',
    receivedAt: at(14, 2, 40),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    090267261121130205518264093771-BISI ADEOLA
Amount    :    NGN 7000
Value Date    :    2026-11-21
Remarks    :    NECKLACE
Time of Transaction    :    02:02:40 PM
Document Number    :    09026726112113020500`,
  },
  {
    id: 'e5',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Debit: NGN 7,000.00]',
    time: '14:41',
    receivedAt: at(14, 41, 0),
    inSpam: false,
    body: `We wish to inform you that a DEBIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    090267261121130205518264093771-REVERSAL BISI ADEOLA
Amount    :    NGN 7000
Value Date    :    2026-11-21
Remarks    :    RVSL
Time of Transaction    :    02:41:00 PM
Document Number    :    09026726112113020599`,
  },
  {
    id: 'e6',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 5,000.00]',
    time: '15:20',
    receivedAt: at(15, 20, 40),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    100033261121142035602947318256-OLUWAKEMI JOHNSON
Amount    :    NGN 5000
Value Date    :    2026-11-21
Time of Transaction    :    03:20:40 PM
Document Number    :    10003326112114203500`,
  },
  {
    id: 'e7',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 5,000.00]',
    time: '15:23',
    receivedAt: at(15, 23, 15),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    100033261121142310274819605338-OLUWAKEMI JOHNSON
Amount    :    NGN 5000
Value Date    :    2026-11-21
Time of Transaction    :    03:23:15 PM
Document Number    :    10003326112114231000`,
  },
  {
    // The vendor sends Kemi's second payment back from the bank app.
    id: 'e8',
    later: true,
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Debit: NGN 5,000.00]',
    time: '16:05',
    receivedAt: at(16, 5, 10),
    inSpam: false,
    body: `We wish to inform you that a DEBIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    000013261121160458391027465813-TRF TO OLUWAKEMI JOHNSON
Amount    :    NGN 5000
Value Date    :    2026-11-21
Remarks    :    REFUND
Time of Transaction    :    04:05:10 PM
Document Number    :    00001326112116045800`,
  },
  {
    id: 'e9',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 12,000.00]',
    time: '17:15',
    receivedAt: at(17, 15, 40),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    000004261121171503829164730528-NGOZI OKONKWO
Amount    :    NGN 12000
Value Date    :    2026-11-21
Time of Transaction    :    05:15:40 PM
Document Number    :    00000426112117150300`,
  },
  {
    id: 'e10',
    from: GTBANK,
    subject: 'GeNS Transaction Alert [Credit: NGN 500.00]',
    time: '17:22',
    receivedAt: at(17, 22, 30),
    inSpam: false,
    body: `We wish to inform you that a CREDIT transaction occurred on your account with us.
Account Number    :    ******0001
Description    :    000004261121172204617382950164-NGOZI OKONKWO
Amount    :    NGN 500
Value Date    :    2026-11-21
Time of Transaction    :    05:22:30 PM
Document Number    :    00000426112117220400`,
  },
]

// The shop's GTBank app history for the day, newest first, as a vendor would
// screenshot it. Rows show truncated session IDs, not payer names.
export const SAMPLE_HISTORY: {
  bank: string
  heading: string
  rows: RawHistoryRow[]
} = {
  bank: 'gtbank',
  heading: 'Sat, 21 Nov 2026',
  rows: [
    {
      amountText: '+₦22,000.00',
      direction: 'Credit',
      description: '090405261121163012448…',
      dateTime: '4:31 PM',
    },
    {
      amountText: '-₦5,000.00',
      direction: 'Debit',
      description: '000013261121160458391… TRF TO OLUWAKEMI',
      dateTime: '4:05 PM',
    },
    {
      amountText: '+₦5,000.00',
      direction: 'Credit',
      description: '100033261121142310274…',
      dateTime: '3:23 PM',
    },
    {
      amountText: '+₦5,000.00',
      direction: 'Credit',
      description: '100033261121142035602…',
      dateTime: '3:20 PM',
    },
    {
      amountText: '-₦7,000.00',
      direction: 'Debit',
      description: 'RVSL 090267261121130205518…',
      dateTime: '2:41 PM',
    },
    {
      amountText: '+₦7,000.00',
      direction: 'Credit',
      description: '090267261121130205518…',
      dateTime: '2:02 PM',
    },
    {
      amountText: '+₦9,000.00',
      direction: 'Credit',
      description: 'MOBILE TRF 0123456789',
      dateTime: '1:11 PM',
    },
    {
      amountText: '+₦18,500.00',
      direction: 'Credit',
      description: '100004261121100212384…',
      dateTime: '11:02 AM',
    },
  ],
}

// Midnight of the sample day, for history rows that print only a time.
export const SAMPLE_DAY_MS = Date.UTC(2026, 10, 21)

// The sample shop's own terms, as a vendor would type them.
export const SAMPLE_SHOP_RULES: ShopRules = {
  homeState: 'Lagos',
  methods: ['own-rider', 'courier', 'pickup', 'nationwide'],
  areaFees: [
    { area: 'Yaba', feeKobo: 150_000 },
    { area: 'Surulere', feeKobo: 150_000 },
    { area: 'Ikeja', feeKobo: 200_000 },
  ],
  otherAreasFeeKobo: null,
  parks: [
    { state: 'Abuja', park: 'Jabi', feeKobo: 600_000 },
    { state: 'Abuja', park: 'Utako', feeKobo: 600_000 },
    { state: 'Enugu', park: 'Holy Ghost', feeKobo: 500_000 },
    { state: 'Ibadan', park: 'Iwo Road', feeKobo: 350_000 },
  ],
  pickupAddress: '3 Herbert Macaulay Way, Yaba',
  pickupHours: 'Monday to Saturday, 10am to 6pm',
  paymentWaitMin: 60,
  refundTerms:
    'Exchanges within 3 days if the item is unworn with its tag. Money is refunded only for items that are out of stock or sent wrongly.',
  policies: [
    'Lekki, Ajah and other areas go by courier; we send you the quote, and you can pay it to us or to the rider on delivery.',
    'Orders confirmed before 2pm are sent the same day; later orders go out the next morning.',
    'We do not deliver on Sundays.',
    'Custom sizes and tailoring take 5 working days and need full payment first.',
  ].join('\n\n'),
  fromFile: [],
}

const item = (
  id: string,
  name: string,
  naira: number,
  qty: number | null,
): Product => ({
  id: `sample-${id}`,
  name,
  priceKobo: naira * 100,
  qty,
  countedAt: 0,
  updatedAt: 0,
})

// The sample shop's stock. The ankara gown is the last one, so it sells out
// once Adaeze's order is paid; the red handbag is already gone.
export const SAMPLE_PRODUCTS: Product[] = [
  item('gown', 'Ankara gown', 15_000, 1),
  item('green-gown', 'Green ankara gown', 9_500, 2),
  item('headwrap', 'Headwrap', 3_500, 12),
  item('jeans', 'Blue jeans', 12_000, 4),
  item('sneakers', 'White sneakers', 9_000, 3),
  item('bag', 'Brown leather bag', 18_500, 2),
  item('necklace', 'Beaded necklace', 7_000, 5),
  item('scarf', 'Silk scarf', 5_000, null),
  item('cap', 'Plain black cap', 11_000, 6),
  item('abaya', 'Black abaya', 16_000, 2),
  item('sandals', 'Brown leather sandals', 9_500, 3),
  item('handbag', 'Red handbag', 20_000, 0),
]
