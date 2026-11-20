import type { AlertEmail } from '../verify/alerts'
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
  expected: 'matched' | 'not yet credited' | 'mismatch' | 'check'
}

export type SampleEmail = AlertEmail & { subject: string; time: string }

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
          sessionId: '100004261121100212000000000123',
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
          sessionId: '000014261121124501000000000456',
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
Description    :    100004261121100212000000000123-ADAEZE OKAFOR
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
Description    :    000014261121124501000000000456-TUNDE BAKARE
Amount    :    NGN 12000
Value Date    :    2026-11-21
Time of Transaction    :    12:46:40 PM`,
  },
  {
    id: 'e3',
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
]
