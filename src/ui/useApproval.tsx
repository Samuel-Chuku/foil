import { useCallback, useState, type ReactNode } from 'react'
import { approve, type Approved, type CloudRequest } from '../cloud/approval'
import { ApprovalDialog } from './ApprovalDialog'

type Pending = {
  request: CloudRequest
  settle: (a: Approved | null) => void
  // What had focus when the send was asked for, before the screen disabled
  // it while waiting, so the dialog can hand focus back when it closes.
  opener: HTMLElement | null
}

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
        setPending({
          request,
          settle,
          opener:
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null,
        })
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
        opener={pending.opener}
        onSend={() => close(approve(pending.request))}
        onCancel={() => close(null)}
      />
    ),
  }
}
