import { shopWords } from '../config/marketWords'
import { isChartId, type ChartId } from './charts'

// What the cloud says about the numbers. It writes the words and picks which
// of the desk's charts backs each point; it never supplies a number to draw.

export type Finding = { text: string; chart: ChartId | null }

export type Report = {
  headline: string
  findings: Finding[]
  suggestions: string[]
}

export function reportInstructions(): string {
  const w = shopWords()
  return `You are a sharp, kind business adviser for ${w.shop}. From the numbers below only, write a short review of the period in ${w.language}: a one-sentence headline, three to five findings, and two or three practical suggestions the shop owner can act on this week (for example restocking, chasing open orders, or being online at the busy hours). For each finding, pick the one chart that best shows it, or "none". Use ${w.money}. Do not invent numbers that are not given. Never call a payment or a customer fake or a fraud. Do not give financial, tax, loan or investment advice.`
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function pickReport(json: unknown): Report {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  const findings = Array.isArray(o.findings) ? o.findings : []
  const suggestions = Array.isArray(o.suggestions) ? o.suggestions : []
  return {
    headline: text(o.headline),
    findings: findings
      .map((f) => {
        const x = (f && typeof f === 'object' ? f : {}) as Record<
          string,
          unknown
        >
        return {
          text: text(x.text),
          chart: isChartId(x.chart) ? x.chart : null,
        }
      })
      .filter((f) => f.text)
      .slice(0, 5),
    suggestions: suggestions.map(text).filter(Boolean).slice(0, 3),
  }
}

export type Answer = { text: string; chart: ChartId | null }

// A books-chat reply: the words, and at most one chart picked by its id.
export function pickAnswer(json: unknown): Answer {
  const o = (json && typeof json === 'object' ? json : {}) as Record<
    string,
    unknown
  >
  return { text: text(o.answer), chart: isChartId(o.chart) ? o.chart : null }
}
