import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useApproval } from './useApproval'
import { useModelJobs } from './useModelJobs'
import { ShopClockContext, useShopClock } from './useShopClock'
import { shopClock } from '../ledger/clock'
import { VoiceCard } from './VoiceCard'
import { extraMoney } from '../ledger/settle'
import type { Order } from '../ledger/types'
import { formatMoney } from '../verify/money'
import type { OpenChat, PanelHost, PanelRequest } from './host'
import { fileToImage, importBankApp, type BankAppResult } from './bankApp'
import { ExtraMoney } from './ExtraMoney'
import { ShopRulesCard } from './ShopRulesCard'
import { StockCard } from './StockCard'
import { QueueCard } from './QueueCard'
import { useOnline } from './useOnline'
import { DropCard } from './DropCard'
import { MoneyPulseCard } from './MoneyPulseCard'
import { BooksCard } from './BooksCard'
import { market } from '../config/market'
import { findOrders } from '../ledger/search'
import { DeliveriesCard } from './DeliveriesCard'
import { Avatar } from './Avatar'
import { AskCard } from './AskCard'
import { ReceiptCard } from './ReceiptCard'
import { ReceiptLookCard } from './ReceiptLookCard'
import { useBrand } from './useBrand'
import { PanelTabs, TabPanel, type TabId } from './PanelTabs'
import { prefsStore, usesDrops } from './prefs'
import { SettingsView } from './SettingsView'
import { receiptFor } from '../capture/customerReceipt'
import { TrendsCard } from './TrendsCard'
import type { ShopRulesApi } from './useShopRules'
import { type DeviceApi } from './useDevice'
import { loadingLine, type LedgerApi } from './useLedger'
import { Icon } from './icons'
import { Badge } from './Badge'
import { errorText } from './errorText'
import { useChatDesk } from './chat/useChatDesk'
import { PaymentCard } from './chat/PaymentCard'
import { OrderCard } from './chat/OrderCard'
import { DraftCard } from './chat/DraftCard'
import { paymentText } from './chat/paymentText'
import type { Step } from './chat/work'
import { GoogleResult } from './GoogleResult'
import { useGoogle } from './useGoogle'
import { dailyTable, ordersTable } from '../google/sheet'
import { deliveryRunEvent, nextHour } from '../google/calendar'

// The on-device model's state as one line with a mark, and, when nothing can
// be read here yet, the vendor's choice between downloading it and the cloud.
function DeviceStatus(props: { device: DeviceApi }) {
  const { device } = props
  // The download needs a connection, so it is not offered offline.
  const online = useOnline()
  const downloading = device.progress !== null || device.state === 'downloading'
  const view = downloading
    ? 'downloading'
    : device.state === 'available'
      ? device.warm === 'warming'
        ? 'warming'
        : 'ready'
      : device.consent && device.state !== 'checking'
        ? 'cloud'
        : device.state
  const line = {
    checking: 'Checking for the on-device model…',
    warming: 'Loading the on-device model so your first click is quick…',
    ready: 'On-device model ready. Receipts and chats are read here.',
    downloading:
      device.progress === null
        ? 'Chrome is downloading the on-device model.'
        : 'Downloading the on-device model',
    downloadable: 'The on-device model is not downloaded yet.',
    unavailable: 'This computer has no on-device model.',
    cloud:
      "No on-device model here, so reading goes to Google's cloud as you agreed.",
  }[view]
  const ask =
    device.asking || (device.state === 'unavailable' && !device.consent)
  const canDownload = device.state === 'downloadable' && online
  const pct =
    device.progress === null ? null : Math.round(device.progress * 100)
  return (
    <div className="device" data-state={view}>
      <p className="device-line" aria-live="polite">
        <span className="device-mark" aria-hidden="true" />
        <span>{line}</span>
        {view === 'downloadable' && !ask && online && (
          <button
            type="button"
            className="link"
            onClick={() => void device.download()}
          >
            Download it
          </button>
        )}
      </p>
      {downloading && (
        <div className="device-progress">
          <progress
            aria-label="On-device model download"
            max={100}
            {...(pct !== null && { value: pct })}
          />
          <span>
            {pct === null
              ? 'Reading here works once it finishes.'
              : `${pct}% done`}
          </span>
        </div>
      )}
      {device.waiting > 0 && (
        <p className="hint" aria-live="polite">
          {device.waiting} more {device.waiting === 1 ? 'step' : 'steps'}{' '}
          waiting for the model; they run one at a time.
        </p>
      )}
      {device.consent && (
        <p className="hint">
          {view === 'cloud'
            ? 'You can take this back at any time. '
            : 'Cloud fallback is on. '}
          <button
            type="button"
            className="link"
            onClick={() => device.setConsent(false)}
          >
            Turn the cloud off
          </button>
        </p>
      )}
      {ask && !device.consent && device.progress === null && (
        <section className="consent" aria-labelledby="consent-h">
          <h3 id="consent-h">How should this computer read?</h3>
          {canDownload && (
            <div className="consent-choice">
              <h4>On this computer</h4>
              <p>
                Chrome downloads its model once. It is large and takes a while;
                afterwards receipts, orders and drafts are read privately here,
                even offline.
              </p>
              <button type="button" onClick={() => void device.download()}>
                Download the on-device model
              </button>
            </div>
          )}
          <div className="consent-choice">
            <h4>
              {canDownload ? 'Or in the cloud, now' : "In Google's cloud"}
            </h4>
            <p>
              {canDownload
                ? ''
                : 'Without the on-device model nothing can be read on this computer. '}
              If you agree, the receipt, chat text or draft details for each
              action you click are sent to Google&apos;s Gemini service through
              Firebase. Your saved customers and orders stay on this computer
              either way, and you can turn this off at any time.
            </p>
            <button
              type="button"
              className={canDownload ? 'quiet' : undefined}
              onClick={() => device.setConsent(true)}
            >
              Use the cloud for these actions
            </button>
          </div>
          <button
            type="button"
            className="link"
            onClick={() => device.setConsent(false)}
          >
            Not now
          </button>
        </section>
      )}
    </div>
  )
}

type PanelProps = {
  chat: OpenChat | null
  request: PanelRequest | null
  ledger: LedgerApi
  device: DeviceApi
  host: PanelHost
  shop: ShopRulesApi
  // Where alerts come from in this host: the extension's Gmail accounts.
  inbox?: ReactNode
  // Whether the shop picks its market here (the extension) or the host has
  // its own switcher (the demo).
  pickMarket?: boolean
}

// The panel runs on the host's clock, which the demo sets to its sample day;
// every card inside reads it from here.
export function Panel(props: PanelProps) {
  const { host } = props
  const clock = useMemo(() => shopClock(() => host.now()), [host])
  return (
    <ShopClockContext value={clock}>
      <PanelBody {...props} />
    </ShopClockContext>
  )
}

function PanelBody(props: PanelProps) {
  const { chat, ledger, device, host, shop } = props
  const online = useOnline()
  const clock = useShopClock()
  const approval = useApproval()
  const jobs = useModelJobs(device, approval.ask)
  const google = useGoogle(host, approval.ask)
  const [sheetNames, setSheetNames] = useState(false)
  const brand = useBrand()
  const [tab, setTab] = useState<TabId>('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const userPrefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.get)
  // A click in WhatsApp, or opening another chat, brings the chat's tab
  // forward.
  const openPhone = props.chat?.phone ?? null
  const [shownFor, setShownFor] = useState({
    phone: openPhone,
    request: props.request,
  })
  if (shownFor.phone !== openPhone || shownFor.request !== props.request) {
    setShownFor({ phone: openPhone, request: props.request })
    if (
      (openPhone && shownFor.phone !== openPhone) ||
      (props.request && shownFor.request !== props.request)
    ) {
      setTab('chat')
    }
  }
  const { data, config } = ledger
  const drops = usesDrops(userPrefs, data?.drops.length ?? 0)
  // Money that pays no order: the open list for the whole day, and the part
  // that belongs with this chat (this order's overpayment, the customer's own
  // decided extras, and any undecided payment from whoever paid their order).
  const extraRows = data
    ? extraMoney(data.orders, data.credits, data.settlements, config)
    : []
  // Money waiting for the vendor's decision, shown on the Money tab.
  const undecided = extraRows.filter((r) => !r.settlement).length
  const desk = useChatDesk({ chat, ledger, host, shop, jobs, extraRows })
  const {
    patch,
    order,
    current,
    verify,
    capture,
    takeStreet,
    readVoice,
    applyVoice,
    rewrite,
    translate,
    draft,
    customerName,
  } = desk
  const [appBank, setAppBank] = useState('')
  const [bankApp, setBankApp] = useState<Step<BankAppResult> | null>(null)

  const today = clock.today()
  const todays = data?.orders.filter((o) => clock.day(o) === today) ?? []
  const [orderQuery, setOrderQuery] = useState('')
  const searching = orderQuery.trim() !== ''
  const listed = searching
    ? findOrders(data?.orders ?? [], data?.customers ?? [], orderQuery)
    : todays

  // What the vendor picked from the floating desk in WhatsApp. The ref
  // stops development double-rendering from running a click twice.
  const request = props.request
  const handled = useRef<number | null>(null)
  const onRequest = useEffectEvent((r: PanelRequest) => {
    if (r.action === 'verify') void verify(r.messageId)
    else if (r.action === 'voice') void readVoice(r.messageId)
    else if (r.action === 'draft') void draft()
    else if (r.action === 'rewrite') void rewrite(r.style, r.text)
    else if (r.action === 'translate') void translate()
    else if (r.action === 'ask') {
      setSettingsOpen(false)
      const q = document.getElementById('ask-q')
      q?.scrollIntoView({ block: 'center' })
      q?.focus()
    } else void capture()
  })
  useEffect(() => {
    if (!request || handled.current === request.nonce) return
    handled.current = request.nonce
    onRequest(request)
  }, [request])

  async function readBankAppFile(file: File) {
    setBankApp({ status: 'running', note: 'Reading the screenshot…' })
    try {
      const value = await importBankApp(
        await fileToImage(file),
        { bank: appBank || null, day: clock.dayStart() },
        jobs,
        ledger,
      )
      setBankApp({ status: 'done', value })
    } catch (error) {
      setBankApp({ status: 'error', message: errorText(error) })
    }
  }

  const c = current.capture
  const d = current.draft
  const receipt =
    order && data
      ? receiptFor(
          order,
          data.credits,
          shop.rules.shopName,
          data.customers.find((x) => x.id === order.customerId)?.name ?? null,
        )
      : null

  // Every order and a line per day, to the vendor's own sheet.
  function sendSheet() {
    if (!data) return
    return google.sendSheet(
      'sheet',
      [
        ordersTable(data.orders, data.credits, clock.day, customerName, {
          names: sheetNames,
        }),
        dailyTable(data.orders, data.credits, clock.day),
      ],
      host.now(),
      shop.rules.shopName,
    )
  }

  // A delivery run for one area, in the vendor's calendar.
  function addRun(area: string, orders: Order[], startMs: number) {
    return google.addToCalendar(
      `run:${area}`,
      deliveryRunEvent({
        area,
        orders,
        startMs,
        minutes: 90,
        timeZone: market().timeZone,
      }),
      'Add a delivery run',
    )
  }

  return (
    <aside className="panel" aria-label="Foil">
      <header>
        <div className="panel-title">
          <h2>Foil</h2>
          <button
            type="button"
            className="quiet"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <Icon name={settingsOpen ? 'back' : 'settings'} />
            {settingsOpen ? 'Back to Foil' : 'Settings'}
          </button>
        </div>
        <DeviceStatus device={device} />
        {!online && (
          <p className="offline" role="status">
            You are offline. Reading receipts, capturing orders and drafting
            replies still work on this computer. Your books and bank alert
            emails catch up when you are back online, and voice notes, the books
            chat and reviews wait for the connection.
          </p>
        )}
      </header>

      {settingsOpen && (
        <SettingsView
          device={device}
          google={google}
          dropsRun={data?.drops.length ?? 0}
        />
      )}

      {/* Hidden rather than unmounted, so work in progress survives a visit
          to Settings. */}
      <div className="desk" hidden={settingsOpen}>
        {ledger.justPaid.length > 0 && data && (
          <section
            className="card now-paid"
            data-tone="money"
            aria-label="Now paid"
            aria-live="polite"
          >
            <h3>
              <Icon name="check" />
              Now paid
            </h3>
            <ul>
              {ledger.justPaid.map((id) => {
                const o = data.orders.find((x) => x.id === id)
                if (!o) return null
                return (
                  <li key={id}>
                    Order {o.code} for {customerName(o.customerId)}
                    {o.amountKobo !== null && `, ${formatMoney(o.amountKobo)}`}:
                    the money arrived. Open the chat to send a confirmation.{' '}
                    <button
                      type="button"
                      className="link"
                      onClick={() => ledger.seen(id)}
                    >
                      Dismiss
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {ledger.loadError && (
          <p className="error" role="alert">
            Couldn&apos;t open the records on this computer: {ledger.loadError}{' '}
            Close and reopen Foil. If it keeps happening, check that Chrome is
            allowed to keep site data for this page.
          </p>
        )}

        <PanelTabs
          current={tab}
          onChange={setTab}
          counts={{ money: undecided }}
        />

        <TabPanel id="chat" current={tab}>
          {!chat ? (
            <p className="empty">
              Open a chat to verify a payment, capture the order or draft a
              reply.
            </p>
          ) : (
            <>
              <header className="who customer">
                <Avatar name={chat.contactName} />
                <span>
                  <strong>{chat.contactName}</strong>
                  <span className="phone">{chat.phone}</span>
                </span>
              </header>

              <PaymentCard
                chat={chat}
                desk={desk}
                ledger={ledger}
                shop={shop}
                busy={device.busy}
              />
              <p className="visually-hidden" role="status">
                {c?.status === 'running'
                  ? c.note
                  : c?.status === 'done'
                    ? 'Order captured. Check the details in the Order card.'
                    : ''}
              </p>
              <p className="visually-hidden" role="status">
                {d?.status === 'running'
                  ? d.note
                  : d?.status === 'done'
                    ? 'Draft placed in the message box. It is not sent.'
                    : ''}
              </p>

              <OrderCard
                chat={chat}
                desk={desk}
                ledger={ledger}
                shop={shop}
                busy={device.busy}
              />

              {current.voice && (
                <VoiceCard
                  step={current.voice}
                  badge={(r) => <Badge source={r.source} ms={r.ms} />}
                  hasForm={current.capture?.status === 'done'}
                  onUse={applyVoice}
                  onStreet={takeStreet}
                  onClose={() => patch(chat.phone, { voice: undefined })}
                />
              )}
              {receipt && order && (
                <ReceiptCard
                  key={order.id}
                  receipt={receipt}
                  brand={brand.brand}
                  onInsert={async (text) => {
                    await host.insertDraft(chat.phone, text)
                  }}
                />
              )}
              <DraftCard desk={desk} busy={device.busy} />
            </>
          )}
        </TabPanel>

        <TabPanel id="today" current={tab}>
          <QueueCard
            ledger={ledger}
            device={device}
            jobs={jobs}
            delivers={shop.rules.methods.length > 0}
            onOpen={host.openChat}
          />

          <section className="card" data-tone="order" aria-labelledby="today-h">
            <h3 id="today-h">
              <Icon name="bag" />
              {searching ? 'Find an order' : "Today's orders"}
            </h3>
            {/* Nothing to search until the shop has saved an order. */}
            {(searching || (data?.orders.length ?? 0) > 0) && (
              <>
                <label className="visually-hidden" htmlFor="order-search">
                  Find an order by number, name, phone or item
                </label>
                <input
                  id="order-search"
                  type="search"
                  value={orderQuery}
                  placeholder="Find by number, name, phone or item"
                  onChange={(e) => setOrderQuery(e.target.value)}
                />
              </>
            )}
            {!data && <p className="empty">{loadingLine(ledger)}</p>}
            {data && listed.length === 0 && (
              <p className="empty">
                {searching
                  ? 'No order matches that, on any day.'
                  : data.orders.length > 0
                    ? 'No orders saved today yet. Search finds older ones.'
                    : "No orders yet. Capture one from a customer's chat and it lands here."}
              </p>
            )}
            {listed.length > 0 && (
              <ul className="orders">
                {listed.map((o) => (
                  <li key={o.id}>
                    <span>
                      {o.code}.{' '}
                      {host.openChat && o.customerId ? (
                        <button
                          type="button"
                          className="link"
                          onClick={() => host.openChat?.(o.customerId!)}
                        >
                          {customerName(o.customerId)}
                        </button>
                      ) : (
                        customerName(o.customerId)
                      )}
                      {searching && clock.day(o) !== today && (
                        <span className="hint"> · {clock.day(o)}</span>
                      )}
                    </span>
                    <span>
                      {o.amountKobo === null ? '' : formatMoney(o.amountKobo)}
                    </span>
                    <span data-kind={o.payment.state}>
                      {paymentText(o, data?.credits ?? [])}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {drops && <DropCard ledger={ledger} clock={clock.time} side="live" />}

          {shop.rules.methods.length > 0 && (
            <DeliveriesCard
              ledger={ledger}
              customerName={customerName}
              onOpen={host.openChat}
              onAddRun={(area, orders, at) => void addRun(area, orders, at)}
              runStatus={(area) => google.status[`run:${area}`]}
            />
          )}
        </TabPanel>

        <TabPanel id="money" current={tab}>
          <MoneyPulseCard ledger={ledger} />

          {props.inbox}

          <section className="card" data-tone="pay" aria-labelledby="app-h">
            <h3 id="app-h">
              <Icon name="money" />
              Bank app screenshot
            </h3>
            <p className="hint">
              When an alert email is missing, add a screenshot of today&apos;s
              history from your bank app. It is read on this computer, and only
              money the alerts did not show is added.
            </p>
            <label>
              Your bank{' '}
              <select
                value={appBank}
                onChange={(e) => setAppBank(e.target.value)}
              >
                <option value="">Not sure</option>
                {config.banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="file">
              Screenshot (PNG or JPEG){' '}
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={bankApp?.status === 'running' || device.busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void readBankAppFile(file)
                }}
              />
            </label>
            {bankApp?.status === 'running' && (
              <p aria-live="polite">{bankApp.note}</p>
            )}
            {bankApp?.status === 'error' && (
              <p className="error" role="alert">
                {bankApp.message}
              </p>
            )}
            {bankApp?.status === 'done' && (
              <>
                <Badge
                  source={bankApp.value.reading.source}
                  ms={bankApp.value.reading.ms}
                />
                <p>
                  {bankApp.value.reading.fields.length} rows read;{' '}
                  {bankApp.value.added.length === 0
                    ? 'nothing new beyond the alerts.'
                    : `${bankApp.value.added.length} new added.`}
                </p>
              </>
            )}
          </section>

          <section className="card" data-tone="money" aria-labelledby="extra-h">
            <h3 id="extra-h">
              <Icon name="money" />
              Money not tied to an order
            </h3>
            {extraRows.length === 0 ? (
              <p className="empty">
                {data?.credits.length
                  ? 'Every credit read so far pays for an order.'
                  : 'No bank alerts read yet.'}
              </p>
            ) : (
              <ExtraMoney
                rows={extraRows}
                onUndo={(id) => void ledger.unsettle(id)}
                onSettle={(row, state) =>
                  void ledger.settleCredit(
                    row,
                    state,
                    row.settlement?.customerId ?? null,
                  )
                }
              />
            )}
            <p className="hint">
              Foil records what you decide. Refunds are sent from your bank app.
            </p>
          </section>
          <BooksCard ledger={ledger} />

          <TrendsCard
            ledger={ledger}
            jobs={jobs}
            badge={(r) => <Badge source={r.source} ms={r.ms} />}
          />
          {data && data.orders.length > 0 && (
            <details className="card shop-rules" data-tone="money">
              <summary>
                <h3>
                  <Icon name="table" />
                  Your orders in Google Sheets
                </h3>
                <span className="hint">
                  {google.sheet?.sentAt
                    ? `Last sent ${new Date(google.sheet.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : 'Every order and a total per day'}
                </span>
              </summary>
              <p className="hint">
                Every order and a total for each day, laid out in a sheet in
                your own Google Drive. Sending again replaces them, so nothing
                doubles.
              </p>
              <div className="sheet-send">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={sheetNames}
                    onChange={(e) => setSheetNames(e.target.checked)}
                  />{' '}
                  Include customer names
                </label>
                <button
                  type="button"
                  className="quiet"
                  disabled={google.status.sheet?.kind === 'busy'}
                  onClick={() => void sendSheet()}
                >
                  <Icon name="table" />
                  Send all orders
                </button>
                <GoogleResult status={google.status.sheet} />
              </div>
            </details>
          )}
        </TabPanel>

        <TabPanel id="shop" current={tab}>
          <ShopRulesCard
            shop={shop}
            jobs={jobs}
            pickMarket={props.pickMarket}
          />

          <ReceiptLookCard brand={brand} shopName={shop.rules.shopName} />

          <StockCard ledger={ledger} device={device} jobs={jobs} />

          {drops && (
            <DropCard
              ledger={ledger}
              clock={clock.time}
              side="setup"
              onStarted={() => setTab('today')}
            />
          )}
        </TabPanel>

        <AskCard
          deviceReady={device.state === 'available'}
          ledger={ledger}
          rules={shop.rules}
          online={online}
          jobs={jobs}
          badge={(r) => <Badge source={r.source} ms={r.ms} />}
          openChat={host.openChat}
          sendSheet={() => void sendSheet()}
          addRun={(area, ids) =>
            void addRun(
              area,
              (data?.orders ?? []).filter((o) => ids.includes(o.id)),
              nextHour(host.now()),
            )
          }
        />
      </div>

      <p className="privacy">
        Customer names, phone numbers and addresses stay on this computer. Your
        books in the cloud hold only amounts and payment states.
        {ledger.books.state === 'syncing' && ' Updating your books…'}
        {ledger.books.state === 'synced' && ' Books up to date.'}
        {ledger.books.state === 'offline' &&
          ' Saved on this computer; your books update when you are back online.'}
        {ledger.books.state === 'failed' &&
          ` Books not updated yet (${ledger.books.message}); orders are safe on this computer.`}
      </p>
      {approval.dialog}
    </aside>
  )
}
