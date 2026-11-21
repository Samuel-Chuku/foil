import { Schema } from 'firebase/ai'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { CHART_IDS, chartMenu } from '../ledger/charts'
import { pickReport, REPORT_INSTRUCTIONS, type Report } from '../ledger/report'
import type { Reading } from './run'

const chart = Schema.enumString({ enum: [...CHART_IDS, 'none'] })

// Reasoning over a period's numbers is a cloud job: one request, answered as
// structured fields, with charts named by id and drawn on the device.
const model = cloudModel({
  responseMimeType: 'application/json',
  responseSchema: Schema.object({
    properties: {
      headline: Schema.string(),
      findings: Schema.array({
        items: Schema.object({
          properties: { text: Schema.string(), chart },
        }),
      }),
      suggestions: Schema.array({ items: Schema.string() }),
    },
  }),
})

export function reportRequest(numbers: string, days: number): CloudRequest {
  return {
    feature: `Review the last ${days} days`,
    reason:
      'The review is written by the cloud model. Only totals are sent, never who paid or where they live.',
    texts: [REPORT_INSTRUCTIONS, chartMenu(), numbers],
    replaced: [],
  }
}

export async function readReport(request: Approved): Promise<Reading<Report>> {
  const { text, source, ms } = await sendApproved(model(), request)
  return { fields: pickReport(JSON.parse(text) as unknown), source, ms }
}
