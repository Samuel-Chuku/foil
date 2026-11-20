import { ruleFee } from '../capture/delivery'
import {
  DELIVERY_METHODS,
  type DeliveryMethod,
  type ShopRules,
} from '../capture/shopRules'
import type { DeliveryForm } from './deliveryForm'

const SHORT_LABEL: Record<DeliveryMethod, string> = {
  'own-rider': 'Your rider',
  courier: 'Courier',
  'customer-rider': "Customer's own rider",
  pickup: 'Pickup',
  nationwide: 'Park in another state',
}

// Delivery as the vendor confirms it. Changing the method or destination
// fills in the shop's own price where it has one.
export function DeliveryFields(props: {
  form: DeliveryForm
  rules: ShopRules
  onChange: (next: DeliveryForm) => void
}) {
  const { form, rules } = props
  const change = (next: Partial<DeliveryForm>) => {
    const merged = { ...form, ...next }
    const price = merged.method
      ? ruleFee({ ...merged, method: merged.method }, rules)
      : null
    props.onChange(
      price !== null &&
        ['method', 'area', 'state', 'park'].some((k) => k in next)
        ? {
            ...merged,
            fee: String(price / 100),
            paidTo: merged.paidTo || 'shop',
          }
        : merged,
    )
  }
  const m = form.method
  const collects = m !== '' && m !== 'pickup' && m !== 'customer-rider'
  return (
    <fieldset className="delivery">
      <legend>Delivery</legend>
      <label>
        How
        <select
          value={m}
          onChange={(e) =>
            change({ method: e.target.value as DeliveryForm['method'] })
          }
        >
          <option value="">Not discussed yet</option>
          {DELIVERY_METHODS.map((x) => (
            <option key={x} value={x}>
              {SHORT_LABEL[x]}
            </option>
          ))}
        </select>
      </label>
      {(m === 'own-rider' || m === 'courier') && (
        <label>
          Area
          <input
            value={form.area}
            onChange={(e) => change({ area: e.target.value })}
          />
        </label>
      )}
      {m === 'nationwide' && (
        <>
          <label>
            State
            <input
              value={form.state}
              onChange={(e) => change({ state: e.target.value })}
            />
          </label>
          <label>
            Park (empty until the customer chooses)
            <input
              value={form.park}
              onChange={(e) => change({ park: e.target.value })}
            />
          </label>
        </>
      )}
      {collects && (
        <>
          <label>
            Fee (₦, empty until quoted)
            <input
              inputMode="decimal"
              value={form.fee}
              onChange={(e) => change({ fee: e.target.value })}
            />
          </label>
          <label>
            Paid
            <select
              value={form.paidTo}
              onChange={(e) =>
                change({ paidTo: e.target.value as DeliveryForm['paidTo'] })
              }
            >
              <option value="">Not agreed yet</option>
              <option value="shop">To you, with the order</option>
              <option value="rider">To the rider on delivery</option>
            </select>
          </label>
        </>
      )}
    </fieldset>
  )
}
