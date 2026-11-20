import {
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { firebaseApp } from '../firebase'
import { toBookEntry } from './ledger'
import type { Order } from './types'

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
export function syncBook(uid: string, order: Order): Promise<void> {
  return setDoc(
    doc(books(), 'vendors', uid, 'books', order.id),
    toBookEntry(order),
  )
}

// Vendors sign in anonymously: the books need an owner for the security rules,
// and a vendor (or a judge trying the demo) should not need an account first.
export async function vendorId(): Promise<string> {
  const auth = getAuth(firebaseApp)
  await auth.authStateReady()
  return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid
}
