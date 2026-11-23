import { deliveryGroups, nextSteps } from '../capture/deliveries'
import type { ShopRules } from '../capture/shopRules'
import type { Credit } from '../verify/types'
import { CHART_IDS, CHART_TITLES, type ChartId } from './charts'
import {
  answerLines,
  dropLines,
  isToSend,
  isUnpaid,
  moneyLine,
  orderLine,
  rulesLines,
  stockLines,
  waitingLine,
} from './snapshot'
import type { ChatNote, Drop, Order, Product, Settlement } from './types'

// The desk's tools: what the model may look up, and the actions it may put
// in front of the owner. Every tool runs here, on the shop's computer, over
// the same facts the desk already shows: orders by number, items, money,
// stock and rules, never a customer's name, phone, address or chat. Actions
// never happen on the model's say-so: they come back as buttons the owner
// presses or ignores.

export type DeskData = {
  orders: Order[]
  credits: Credit[]
  products: Product[]
  drops: Drop[]
  settlements: Settlement[]
  chats: ChatNote[]
  rules: ShopRules
  // Today's books and this week against last, already written as text.
  books: string
  trends: string
  now: number
}

export const ORDER_GROUPS = [
  'unpaid',
  'to_send',
  'on_the_way',
  'all_open',
] as const
export type OrderGroup = (typeof ORDER_GROUPS)[number]

export const DELIVERY_STEPS = ['out', 'delivered', 'collected'] as const
export type DeliveryStep = (typeof DELIVERY_STEPS)[number]

// Something the model suggests and only the owner can do.
export type Proposal =
  | { kind: 'delivery'; orderId: string; code: string; to: DeliveryStep }
  | { kind: 'open-chat'; customerKey: string; code: string }
  | { kind: 'sheet' }
  | { kind: 'calendar-run'; area: string; orderIds: string[] }

export type ToolResult = {
  // What goes back to the model.
  text: string
  // What the owner sees as a step of the answer.
  step: string
  proposal?: Proposal
  chart?: ChartId
}

// Plain JSON-schema shapes, so the same list serves the cloud's function
// declarations and the on-device router's constrained output.
type Param = { type: 'string'; description: string; enum?: readonly string[] }

export type ToolSpec = {
  name: string
  description: string
  params: Record<string, Param>
  // Actions are shown to the owner as buttons; lookups only inform.
  action?: boolean
}

export const TOOLS: ToolSpec[] = [
  {
    name: 'list_orders',
    description:
      'List open orders in one group, by number, with items, amount, payment and delivery state.',
    params: {
      which: {
        type: 'string',
        enum: ORDER_GROUPS,
        description:
          'unpaid: still owed money; to_send: paid and waiting to go out; on_the_way: out for delivery; all_open: every order not finished.',
      },
    },
  },
  {
    name: 'order_details',
    description: 'Look up one order by its number.',
    params: {
      number: { type: 'string', description: 'The order number, digits only.' },
    },
  },
  {
    name: 'check_stock',
    description:
      'Stock left and prices. Give a product name to check one item, or leave it empty for the whole list, including what is sold out or running low.',
    params: {
      product: {
        type: 'string',
        description: 'Part of a product name, or empty for all.',
      },
    },
  },
  {
    name: 'todays_money',
    description:
      "Today's books: orders, money in, money still owed, by bank and payment state.",
    params: {},
  },
  {
    name: 'week_trends',
    description:
      'This week against last week: sales, orders, time to pay, busiest hours, top items.',
    params: {},
  },
  {
    name: 'waiting_customers',
    description: 'How many customers are waiting for a reply, by type.',
    params: {},
  },
  {
    name: 'drop_status',
    description: 'The running drop, if any: each piece, its price and state.',
    params: {},
  },
  {
    name: 'money_owed_back',
    description: 'Refunds owed and sent, and extra money kept as credit.',
    params: {},
  },
  {
    name: 'shop_rules',
    description:
      "The shop's delivery fees, pickup hours, refunds and policies.",
    params: {},
  },
  {
    name: 'show_chart',
    description:
      "Show one of the shop's charts under the answer, when a picture helps.",
    params: {
      chart: {
        type: 'string',
        enum: CHART_IDS,
        description: CHART_IDS.map((c) => `${c}: ${CHART_TITLES[c]}`).join(
          '; ',
        ),
      },
    },
    action: true,
  },
  {
    name: 'suggest_delivery_step',
    description:
      'Offer the owner a button to mark a paid order out for delivery, delivered, or collected. Nothing changes until they press it.',
    params: {
      number: { type: 'string', description: 'The order number.' },
      step: {
        type: 'string',
        enum: DELIVERY_STEPS,
        description: 'out, delivered, or collected (for pickups).',
      },
    },
    action: true,
  },
  {
    name: 'suggest_sheet_export',
    description:
      'Offer the owner a button to send all orders and daily totals to their own Google Sheet. They see exactly what goes before it is sent.',
    params: {},
    action: true,
  },
  {
    name: 'suggest_calendar_run',
    description:
      "Offer the owner a button to add one area's delivery run (paid orders waiting to go out) to their Google Calendar.",
    params: {
      area: {
        type: 'string',
        description: 'The area or park, as the deliveries list groups it.',
      },
    },
    action: true,
  },
  {
    name: 'suggest_open_chat',
    description:
      "Offer the owner a button to open the WhatsApp chat behind an order, to follow up. The customer's details stay on the computer.",
    params: {
      number: { type: 'string', description: 'The order number.' },
    },
    action: true,
  },
]

export const TOOL_NAMES = TOOLS.map((t) => t.name)

const GROUP_LABEL: Record<OrderGroup, string> = {
  unpaid: 'unpaid orders',
  to_send: 'orders to send',
  on_the_way: 'orders on the way',
  all_open: 'all open orders',
}

const STEP_LABEL: Record<DeliveryStep, string> = {
  out: 'out for delivery',
  delivered: 'delivered',
  collected: 'collected',
}

const str = (args: Record<string, unknown>, key: string): string => {
  const v = args[key]
  return typeof v === 'string'
    ? v.trim()
    : typeof v === 'number'
      ? String(v)
      : ''
}

const digits = (s: string) => s.replace(/\D/g, '')

function inGroup(o: Order, which: OrderGroup, credits: Credit[]): boolean {
  switch (which) {
    case 'unpaid':
      return isUnpaid(o, credits)
    case 'to_send':
      return isToSend(o, credits)
    case 'on_the_way':
      return o.delivery === 'out'
    case 'all_open':
      return (
        isUnpaid(o, credits) || o.delivery === 'pending' || o.delivery === 'out'
      )
  }
}

// Runs one tool. The arguments come from a model, so they are checked here
// and anything unexpected becomes a plain "not found" rather than an error.
export function runTool(
  name: string,
  rawArgs: unknown,
  d: DeskData,
): ToolResult {
  const args = (
    rawArgs && typeof rawArgs === 'object' ? rawArgs : {}
  ) as Record<string, unknown>
  const byCode = (code: string) =>
    d.orders.find((o) => o.code === digits(code)) ?? null
  switch (name) {
    case 'list_orders': {
      const w = str(args, 'which')
      const which = (ORDER_GROUPS as readonly string[]).includes(w)
        ? (w as OrderGroup)
        : 'all_open'
      const lines = d.orders
        .filter((o) => inGroup(o, which, d.credits))
        .sort((a, b) => Number(a.code) - Number(b.code))
        .map((o) => orderLine(o, d.credits))
      return {
        text: lines.length ? lines.join('\n') : `No ${GROUP_LABEL[which]}.`,
        step: `Looked up ${GROUP_LABEL[which]} (${lines.length})`,
      }
    }
    case 'order_details': {
      const code = digits(str(args, 'number'))
      const o = byCode(code)
      return {
        text: o ? orderLine(o, d.credits) : `There is no order ${code}.`,
        step: `Looked up order #${code || '?'}`,
      }
    }
    case 'check_stock': {
      const want = str(args, 'product').toLowerCase()
      const all = stockLines(d.products, d.orders)
      const lines = want
        ? all.filter((l) => l.toLowerCase().includes(want))
        : all
      const summary = answerLines(d.orders, d.credits, d.products)[2]!
      return {
        text: want
          ? lines.join('\n') || `No product matches "${want}".`
          : [...(lines.length ? lines : ['No stock list yet.']), summary].join(
              '\n',
            ),
        step: want ? `Checked stock for "${want}"` : 'Checked the stock list',
      }
    }
    case 'todays_money':
      return { text: d.books, step: "Read today's books" }
    case 'week_trends':
      return { text: d.trends, step: 'Compared this week with last' }
    case 'waiting_customers':
      return { text: waitingLine(d.chats), step: 'Counted chats waiting' }
    case 'drop_status': {
      const lines = dropLines(d.drops, d.products, d.orders, d.now)
      return {
        text: lines.join('\n') || 'No drop is running.',
        step: 'Checked the drop',
      }
    }
    case 'money_owed_back':
      return { text: moneyLine(d.settlements), step: 'Checked refunds owed' }
    case 'shop_rules': {
      const lines = rulesLines(d.rules)
      return {
        text: lines.join('\n') || 'The shop has not set any rules yet.',
        step: 'Read your shop rules',
      }
    }
    case 'show_chart': {
      const c = str(args, 'chart')
      if (!(CHART_IDS as readonly string[]).includes(c)) {
        return { text: 'No such chart.', step: 'Looked for a chart' }
      }
      const chart = c as ChartId
      return {
        text: 'The chart is shown under the answer.',
        step: `Drew a chart: ${CHART_TITLES[chart]}`,
        chart,
      }
    }
    case 'suggest_delivery_step': {
      const code = digits(str(args, 'number'))
      const o = byCode(code)
      const s = str(args, 'step')
      const to = (DELIVERY_STEPS as readonly string[]).includes(s)
        ? (s as DeliveryStep)
        : null
      if (!o || !to) {
        return {
          text: `There is no order ${code} or no such step.`,
          step: `Looked up order #${code || '?'}`,
        }
      }
      // Only a step the desk itself would offer: a paid order, in order.
      if (!nextSteps(o).some((x) => x.to === to)) {
        return {
          text: `Order ${code} cannot be marked ${STEP_LABEL[to]} now: ${orderLine(o, d.credits)}.`,
          step: `Checked order #${code}`,
        }
      }
      return {
        text: `A button to mark order ${code} ${STEP_LABEL[to]} is shown to the owner. Nothing has changed yet.`,
        step: `Offered: mark #${code} ${STEP_LABEL[to]}`,
        proposal: { kind: 'delivery', orderId: o.id, code, to },
      }
    }
    case 'suggest_open_chat': {
      const code = digits(str(args, 'number'))
      const o = byCode(code)
      if (!o?.customerId) {
        return {
          text: `There is no chat saved for order ${code}.`,
          step: `Looked up order #${code || '?'}`,
        }
      }
      return {
        text: `A button to open the chat for order ${code} is shown to the owner.`,
        step: `Offered: open the chat for #${code}`,
        proposal: { kind: 'open-chat', customerKey: o.customerId, code },
      }
    }
    case 'suggest_sheet_export':
      return {
        text: 'A button to send the orders to Google Sheets is shown to the owner. Nothing has been sent.',
        step: 'Offered: send orders to Google Sheets',
        proposal: { kind: 'sheet' },
      }
    case 'suggest_calendar_run': {
      const want = str(args, 'area').toLowerCase()
      const group = deliveryGroups(d.orders, d.credits).find(
        (g) => want && g.label.toLowerCase().includes(want),
      )
      if (!group) {
        return {
          text: `No paid orders are waiting to go out to "${want}".`,
          step: `Looked for deliveries to ${want || '?'}`,
        }
      }
      return {
        text: `A button to add the ${group.label} run (${group.orders.length} orders) to Google Calendar is shown to the owner.`,
        step: `Offered: add the ${group.label} run to Calendar`,
        proposal: {
          kind: 'calendar-run',
          area: group.label,
          orderIds: group.orders.map((x) => x.order.id),
        },
      }
    }
    default:
      return { text: `There is no tool called ${name}.`, step: 'Tried a tool' }
  }
}

// Everything the lookups could ever return, for the approval dialog: the
// cloud is sent at most this, and only the parts it asks for.
export function lookupPreview(d: DeskData): string {
  const groups = ORDER_GROUPS.filter((g) => g !== 'all_open').map((which) => {
    const r = runTool('list_orders', { which }, d)
    return `${r.step}:\n${r.text}`
  })
  const singles = [
    'check_stock',
    'todays_money',
    'week_trends',
    'waiting_customers',
    'drop_status',
    'money_owed_back',
    'shop_rules',
  ].map((name) => {
    const r = runTool(name, {}, d)
    return `${r.step}:\n${r.text}`
  })
  // Any order may be looked up by number, so every one is shown.
  const every = [...d.orders]
    .sort((a, b) => Number(a.code) - Number(b.code))
    .map((o) => orderLine(o, d.credits))
  return [
    ...groups,
    ...singles,
    `Any order by number (${every.length}):\n${every.join('\n') || 'None.'}`,
  ].join('\n\n')
}

// The tool list for a prompt, for the on-device router.
export function toolMenu(): string {
  return TOOLS.map(
    (t) => `${t.name}(${Object.keys(t.params).join(', ')}): ${t.description}`,
  ).join('\n')
}
