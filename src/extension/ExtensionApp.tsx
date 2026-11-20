import { Panel } from '../ui/Panel'
import type { PanelHost } from '../ui/host'
import { useDevice } from '../ui/useDevice'
import { useLedger } from '../ui/useLedger'
import { useShopRules } from '../ui/useShopRules'
import { lagosFromEpoch } from '../verify/time'
import { GmailCard } from './GmailCard'
import { useGmail } from './useGmail'

// WhatsApp Web supplies the open chat and receives drafts once its content
// script exists; until then the panel shows the day's orders, shop rules,
// stock and the Gmail alert feed.
const host: PanelHost = {
  insertDraft: () => undefined,
  now: () => lagosFromEpoch(Date.now()),
}

export default function ExtensionApp() {
  const ledger = useLedger()
  const device = useDevice()
  const shop = useShopRules()
  const gmail = useGmail(ledger)
  return (
    <Panel
      chat={null}
      verifyRequest={null}
      ledger={ledger}
      device={device}
      host={host}
      shop={shop}
      inbox={
        <GmailCard
          gmail={gmail}
          bankName={(id) =>
            ledger.config.banks.find((b) => b.id === id)?.name ?? id
          }
        />
      }
    />
  )
}
