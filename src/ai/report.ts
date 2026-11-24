import { Schema } from 'firebase/ai'
import type { Approved, CloudRequest } from '../cloud/approval'
import { cloudModel, sendApproved } from '../cloud/send'
import { CHART_IDS, chartMenu } from '../ledger/charts'
import { pickReport, reportInstructions, type Report } from '../ledger/report'
import type { CloudPlan } from './job'
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

function reportRequest(numbers: string, days: number): CloudRequest {
  return {
    feature: `Review the last ${days} days`,
    reason:
      'The review is written by the cloud model. Only totals are sent, never who paid or where they live.',
    texts: [reportInstructions(), chartMenu(), numbers],
    replaced: [],
  }
}

async function readReport(request: Approved): Promise<Reading<Report>> {
  const { text, source, ms } = await sendApproved(model(), request)
  return { fields: pickReport(JSON.parse(text) as unknown), source, ms }
}

// Only totals go, so the review is always a cloud job.
export const planReport = (
  numbers: string,
  days: number,
): CloudPlan<Reading<Report>> => ({
  where: 'cloud',
  request: reportRequest(numbers, days),
  run: readReport,
})
