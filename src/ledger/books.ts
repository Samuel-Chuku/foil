import {
  deleteDoc,
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { firebaseApp } from '../firebase'
import type { Credit } from '../verify/types'
import { toBookEntry, toMoneyEntry } from './ledger'
import type { Order, Settlement } from './types'

let firestore: Firestore | null = null

function books(): Firestore {
  // The persistent cache queues writes made offline and sends them on
  // reconnect, so the books keep up through outages without extra code.
  firestore ??= initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
  return firestore
}

// Resolves when the server has the entry, which may be much later when
// offline; callers should not wait on it before updating the screen.
export function syncBook(
  uid: string,
  order: Order,
  credits: Credit[],
): Promise<void> {
  return setDoc(
    doc(books(), 'vendors', uid, 'books', order.id),
    toBookEntry(order, credits),
  )
}

// Document ids cannot hold a slash; settlement ids are credit ids, which
// come from the bank alert's email id.
const moneyId = (id: string) => id.replace(/\//g, '_')

export function syncMoney(
  uid: string,
  settlement: Settlement,
  credits: Credit[],
): Promise<void> {
  return setDoc(
    doc(books(), 'vendors', uid, 'money', moneyId(settlement.id)),
    toMoneyEntry(settlement, credits),
  )
}

export function dropMoney(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(books(), 'vendors', uid, 'money', moneyId(id)))
}

// Vendors sign in anonymously: the books need an owner for the security rules,
// and a vendor (or a judge trying the demo) should not need an account first.
export async function vendorId(): Promise<string> {
  const auth = getAuth(firebaseApp)
  await auth.authStateReady()
  return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid
}
