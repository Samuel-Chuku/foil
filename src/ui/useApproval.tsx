import { useCallback, useState, type ReactNode } from 'react'
import { approve, type Approved, type CloudRequest } from '../cloud/approval'
import { ApprovalDialog } from './ApprovalDialog'

type Pending = { request: CloudRequest; settle: (a: Approved | null) => void }

// Every cloud job asks here first. `ask` resolves with the approved request,
// or null when the vendor cancels; nothing is sent in either case until the
// caller sends the approved object.
export function useApproval(): {
  ask: (request: CloudRequest) => Promise<Approved | null>
  dialog: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback(
    (request: CloudRequest) =>
      new Promise<Approved | null>((settle) => {
        setPending({ request, settle })
      }),
    [],
  )
  const close = (a: Approved | null) => {
    pending?.settle(a)
    setPending(null)
  }
  return {
    ask,
    dialog: pending && (
      <ApprovalDialog
        request={pending.request}
        onSend={() => close(approve(pending.request))}
        onCancel={() => close(null)}
      />
    ),
  }
}
