import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { newOrder, toBookEntry, toMoneyEntry } from './ledger'

// Runs against the local emulators only (npm run test:rules). The "demo-"
// project ID can never reach a real Firebase project.
const PROJECT = 'demo-vendor-desk'

type Vendor = { app: FirebaseApp; db: Firestore; uid: string }

async function vendor(name: string, signIn = true): Promise<Vendor> {
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key' }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  const uid = signIn ? (await signInAnonymously(auth)).user.uid : ''
  return { app, db, uid }
}

const entry = () =>
  toBookEntry(
    newOrder(
      [],
      {
        mode: 'everyday',
        customerId: '2348000000001',
        items: [],
        amountKobo: 1_850_000,
      },
      1_795_000_000_000,
    ),
    [],
  )

// A synthetic refund decision, with the private fields the books must drop.
const money = () =>
  toMoneyEntry(
    {
      id: 'sample-credit:over',
      creditId: 'sample-credit',
      amountKobo: 50_000,
      state: 'refund owed',
      customerId: '2348000000001',
      refundId: null,
      decidedBy: 'vendor',
      updatedAt: 1_795_000_000_000,
    },
    [],
  )

const allowed = (p: Promise<unknown>) => expect(p).resolves.toBeUndefined()
const denied = (p: Promise<unknown>) =>
  expect(p).rejects.toMatchObject({ code: 'permission-denied' })

describe('Firestore rules for the books', () => {
  let a: Vendor
  let b: Vendor
  let anon: Vendor

  beforeAll(async () => {
    a = await vendor('a')
    b = await vendor('b')
    anon = await vendor('nobody', false)
  })

  afterAll(async () => {
    await Promise.all([a, b, anon].map((v) => deleteApp(v.app)))
  })

  const ref = (v: Vendor, owner: string, id: string) =>
    doc(v.db, 'vendors', owner, 'books', id)

  it('a vendor writes and reads their own book entry', async () => {
    const e = entry()
    await allowed(setDoc(ref(a, a.uid, e.orderId), e))
    const read = await getDoc(ref(a, a.uid, e.orderId))
    expect(read.data()).toEqual(e)
  })

  it("no one else can read or write a vendor's books", async () => {
    const e = entry()
    await setDoc(ref(a, a.uid, e.orderId), e)
    await denied(getDoc(ref(b, a.uid, e.orderId)))
    await denied(setDoc(ref(b, a.uid, e.orderId), e))
    await denied(getDoc(ref(anon, a.uid, e.orderId)))
  })

  it('refuses any field outside the books, such as a customer name', async () => {
    const e = entry()
    await denied(
      setDoc(ref(a, a.uid, e.orderId), { ...e, customerName: 'Sample' }),
    )
  })

  it('refuses wrong types and a mismatched order id', async () => {
    const e = entry()
    await denied(setDoc(ref(a, a.uid, e.orderId), { ...e, payment: 'paid' }))
    await denied(
      setDoc(ref(a, a.uid, e.orderId), { ...e, amountKobo: '18500' }),
    )
    await denied(setDoc(ref(a, a.uid, 'another-order'), e))
  })

  const moneyRef = (v: Vendor, owner: string, id: string) =>
    doc(v.db, 'vendors', owner, 'money', id)

  it('a vendor records money decisions; no one else can see them', async () => {
    const m = money()
    await allowed(setDoc(moneyRef(a, a.uid, 'm1'), m))
    expect((await getDoc(moneyRef(a, a.uid, 'm1'))).data()).toEqual(m)
    await denied(getDoc(moneyRef(b, a.uid, 'm1')))
    await denied(setDoc(moneyRef(b, a.uid, 'm1'), m))
  })

  it('refuses refund details such as an account number', async () => {
    await denied(
      setDoc(moneyRef(a, a.uid, 'm2'), { ...money(), accountNumber: '0123' }),
    )
    await denied(
      setDoc(moneyRef(a, a.uid, 'm2'), { ...money(), state: 'sent' }),
    )
    await denied(
      setDoc(moneyRef(a, a.uid, 'm2'), { ...money(), amountKobo: 0 }),
    )
  })

  it('accepts a part payment and refuses a negative one', async () => {
    const e = { ...entry(), paidKobo: 500_000 }
    await allowed(setDoc(ref(a, a.uid, e.orderId), e))
    await denied(setDoc(ref(a, a.uid, e.orderId), { ...e, paidKobo: -1 }))
  })
})
