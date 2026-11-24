import { describePlan } from '../../capture/delivery'
import { leftOf, productOf } from '../../capture/stock'
import { formatMoney } from '../../verify/money'
import type { OpenChat } from '../host'
import { DeliveryFields } from '../DeliveryFields'
import { toDeliveryForm } from '../deliveryForm'
import { DeliverySteps } from '../DeliveriesCard'
import type { ShopRulesApi } from '../useShopRules'
import { type LedgerApi } from '../useLedger'
import { Icon } from '../icons'
import { Badge } from '../Badge'
import { SourceBadge } from '../SourceBadge'

import type { ChatDesk } from './useChatDesk'
import { paymentText } from './paymentText'

// The order for the open chat: the saved one with its delivery, or the
// order read from the chat for the vendor to check and save.
export function OrderCard(props: {
  chat: OpenChat
  desk: ChatDesk
  ledger: LedgerApi
  shop: ShopRulesApi
  // A model step is running; buttons that start another wait for it.
  busy: boolean
}) {
  const { chat, desk, ledger, shop, busy } = props
  const { data } = ledger
  const { current, order, patch, balance } = desk
  const { undoPick, saveDelivery, capture, saveOrder, editForm } = desk
  const v = current.verify
  const c = current.capture
  // A shop that ticks no delivery option sells without delivery, so orders
  // carry no delivery line at all.
  const offersDelivery = shop.rules.methods.length > 0
  // Before a payment is confirmed, flag a receipt that does not cover the order.
  const amountGap =
    balance === null &&
    v?.status === 'done' &&
    order?.amountKobo != null &&
    v.value.receipt.amountKobo !== null &&
    v.value.receipt.amountKobo !== order.amountKobo

  // What the shop's stock says about an item while the vendor checks an
  // order, so a sold-out item is caught before it is confirmed.
  function stockNote(p: { name: string; qty: string; productId?: string }) {
    const products = data?.products ?? []
    const product = productOf(p, products)
    if (products.length === 0 || (!p.name.trim() && !p.productId)) return null
    if (!product) return <p className="hint">Not on your stock list.</p>
    const left = leftOf(product, data?.orders ?? [], products)
    if (left === null)
      return <p className="hint">{product.name || 'On your stock list'}</p>
    const want = Math.max(1, Number.parseInt(p.qty, 10) || 1)
    return (
      <p className={left < want ? 'error' : 'hint'}>
        {product.name || 'This item'}: {left <= 0 ? 'sold out' : `${left} left`}
        {left > 0 && left < want && `, fewer than ${want}`}
      </p>
    )
  }
  return (
    <>
      <section className="card" data-tone="order" aria-labelledby="order-h">
        <h3 id="order-h">
          <Icon name="bag" />
          Order
        </h3>
        {order && (
          <div className="saved">
            <p>
              <strong>Order {order.code}</strong>{' '}
              {order.amountKobo === null ? '' : formatMoney(order.amountKobo)} ·{' '}
              {paymentText(order, data?.credits ?? [])}
              {order.payment.decidedBy === 'vendor' && ' (confirmed by you)'}
              {order.payment.decidedBy === 'vendor' &&
                order.payment.state === 'matched' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="link"
                      onClick={() => void undoPick()}
                    >
                      Undo my choice
                    </button>
                  </>
                )}
            </p>
            <p>
              {order.items.map((i) => `${i.qty} × ${i.name}`).join(', ') ||
                'No items listed'}
            </p>
            {!offersDelivery &&
            !order.deliveryPlan ? null : current.deliveryEdit ? (
              <form
                className="order-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveDelivery()
                }}
              >
                <DeliveryFields
                  form={current.deliveryEdit}
                  rules={shop.rules}
                  onChange={(deliveryEdit) =>
                    patch(chat.phone, { deliveryEdit })
                  }
                />
                <button type="submit">Save delivery</button>{' '}
                <button
                  type="button"
                  className="quiet"
                  onClick={() => patch(chat.phone, { deliveryEdit: undefined })}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <p>
                Delivery: {describePlan(order.deliveryPlan)}{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    patch(chat.phone, {
                      deliveryEdit: toDeliveryForm(order.deliveryPlan),
                    })
                  }
                >
                  Change
                </button>
              </p>
            )}
            <DeliverySteps
              order={order}
              onSet={(state) => void ledger.setDelivery(order.id, state)}
            />
            {balance !== null && balance > 0 && (
              <p className="hint">
                Ask for the balance of {formatMoney(balance)}. When the customer
                sends a receipt for it, verify it here and it is added to this
                order.
              </p>
            )}
            {amountGap && v?.status === 'done' && (
              <p className="hint">
                The receipt shows {formatMoney(v.value.receipt.amountKobo ?? 0)}{' '}
                but the order total is {formatMoney(order.amountKobo ?? 0)}.
              </p>
            )}
          </div>
        )}
        {!order && !c && (
          <button type="button" disabled={busy} onClick={() => void capture()}>
            Capture order from chat
          </button>
        )}
        {c?.status === 'running' && <p>{c.note}</p>}
        {c?.status === 'error' && (
          <>
            <p className="error" role="alert">
              {c.message}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void capture()}
            >
              Try again
            </button>
          </>
        )}
        {c?.status === 'done' && (
          <form
            className="order-form"
            onSubmit={(e) => {
              e.preventDefault()
              void saveOrder(c.value.form)
            }}
          >
            <Badge source={c.value.source} ms={c.value.ms} />
            <p className="hint">Check the details, then save.</p>
            {c.value.form.items.map((item, n) => (
              <fieldset key={n} className="item">
                <legend>
                  Item {n + 1}{' '}
                  <button
                    type="button"
                    className="link"
                    aria-label={`Remove item ${n + 1}`}
                    onClick={() =>
                      editForm({
                        items: c.value.form.items.filter((_, k) => k !== n),
                      })
                    }
                  >
                    Remove
                  </button>
                </legend>
                {item.pickedBy && (
                  <p className="hint">
                    <SourceBadge source={item.pickedBy} /> Their picture was
                    close to a few of your photos; the model picked this one.
                    Tap another below if it is wrong.
                  </p>
                )}
                {item.choices && (!item.productId || item.pickedBy) && (
                  <div
                    className="choices"
                    role="group"
                    aria-label="Which item is it?"
                  >
                    <p className="hint">
                      Their picture is close to these. Which is it?
                    </p>
                    {item.choices.map((id) => {
                      const p = data?.products.find((x) => x.id === id)
                      if (!p?.photo) return null
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={item.productId === id}
                          className="choice"
                          onClick={() =>
                            editForm({
                              items: c.value.form.items.map((x, k) =>
                                k === n
                                  ? {
                                      ...x,
                                      productId: p.id,
                                      pickedBy: undefined,
                                      name: p.name || 'Item from photo',
                                      price:
                                        p.priceKobo === null
                                          ? x.price
                                          : String(p.priceKobo / 100),
                                    }
                                  : x,
                              ),
                            })
                          }
                        >
                          <img src={p.photo.thumb} alt="" />
                          <span>
                            {p.name || (p.dropNo ? `#${p.dropNo}` : 'Photo')}
                            {p.priceKobo !== null &&
                              ` · ${formatMoney(p.priceKobo)}`}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {item.productId &&
                  data?.products.find((x) => x.id === item.productId)
                    ?.photo && (
                    <img
                      className="item-photo"
                      src={
                        data.products.find((x) => x.id === item.productId)!
                          .photo!.thumb
                      }
                      alt="Matched from the customer's picture"
                    />
                  )}
                <label>
                  Item
                  <input
                    value={item.name}
                    onChange={(e) =>
                      editForm({
                        items: c.value.form.items.map((x, k) =>
                          k === n ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Qty
                  <input
                    inputMode="numeric"
                    value={item.qty}
                    onChange={(e) =>
                      editForm({
                        items: c.value.form.items.map((x, k) =>
                          k === n ? { ...x, qty: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Price (₦)
                  <input
                    inputMode="decimal"
                    value={item.price}
                    onChange={(e) =>
                      editForm({
                        items: c.value.form.items.map((x, k) =>
                          k === n ? { ...x, price: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                {stockNote(item)}
              </fieldset>
            ))}
            <button
              type="button"
              className="quiet"
              onClick={() =>
                editForm({
                  items: [
                    ...c.value.form.items,
                    { name: '', qty: '1', price: '' },
                  ],
                })
              }
            >
              Add an item
            </button>
            {(
              [
                ['amount', 'Items total (₦)'],
                ['customerName', 'Customer name'],
                ['address', 'Delivery address (empty for pickup)'],
                ['landmark', 'Landmark'],
                ['area', 'Area'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={c.value.form[key]}
                  onChange={(e) => editForm({ [key]: e.target.value })}
                />
              </label>
            ))}
            {c.value.form.chatPrices?.map((line) => (
              <p className="hint" key={line}>
                {line} The list price is used; change it if you agreed a
                different one.
              </p>
            ))}
            {c.value.form.addressFromLast && (
              <p className="hint">
                The address is from this customer&apos;s last order. Check it is
                still right.
              </p>
            )}
            {offersDelivery && (
              <DeliveryFields
                form={c.value.form.delivery}
                rules={shop.rules}
                onChange={(delivery) => editForm({ delivery })}
              />
            )}
            <button type="submit">Save order</button>{' '}
            <button
              type="button"
              className="quiet"
              onClick={() => patch(chat.phone, { capture: undefined })}
            >
              Discard
            </button>
          </form>
        )}
      </section>
    </>
  )
}
