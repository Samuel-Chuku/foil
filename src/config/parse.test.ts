import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_CONFIG,
  KEYS,
  parseAppConfig,
  remoteDefaults,
} from './parse'

describe('Remote Config parsing', () => {
  it('reads its own defaults back unchanged', () => {
    expect(parseAppConfig(remoteDefaults())).toEqual(DEFAULT_APP_CONFIG)
    expect(parseAppConfig({})).toEqual(DEFAULT_APP_CONFIG)
  })

  it('takes valid values from the console', () => {
    const banks = [
      {
        id: 'wema',
        name: 'Wema Bank',
        nipCode: '000017',
        aliases: ['wema', 'alat'],
        alertSenders: ['alerts@example.com'],
        receiptShowsSessionId: true,
        sessionOffsetMin: 0,
      },
    ]
    const c = parseAppConfig({
      [KEYS.cloudModel]: 'gemini-next-lite',
      [KEYS.banks]: JSON.stringify(banks),
      [KEYS.nameThreshold]: '0.7',
      [KEYS.sameBankWindowMin]: '15',
      [KEYS.sessionOffsetsMin]: '[0]',
    })
    expect(c.cloudModel).toBe('gemini-next-lite')
    expect(c.verify.banks).toEqual(banks)
    expect(c.verify.nameThreshold).toBe(0.7)
    expect(c.verify.sameBankWindowMin).toBe(15)
    expect(c.verify.sessionOffsetsMin).toEqual([0])
    expect(c.verify.interbankWindowMin).toBe(
      DEFAULT_APP_CONFIG.verify.interbankWindowMin,
    )
  })

  it('falls back per value when one is broken', () => {
    const c = parseAppConfig({
      [KEYS.cloudModel]: 'bad model name!',
      [KEYS.banks]: '[{"id":"x","nipCode":"12"}]',
      [KEYS.nameThreshold]: '7',
      [KEYS.clockToleranceMin]: 'soon',
      [KEYS.sessionOffsetsMin]: 'not json',
      [KEYS.pidginGlossary]: '["abeg"]',
      [KEYS.interbankWindowMin]: '90',
    })
    const d = DEFAULT_APP_CONFIG
    expect(c.cloudModel).toBe(d.cloudModel)
    expect(c.verify.banks).toBe(d.verify.banks)
    expect(c.verify.nameThreshold).toBe(d.verify.nameThreshold)
    expect(c.verify.clockToleranceMin).toBe(d.verify.clockToleranceMin)
    expect(c.verify.sessionOffsetsMin).toBe(d.verify.sessionOffsetsMin)
    expect(c.pidginGlossary).toBe(d.pidginGlossary)
    expect(c.verify.interbankWindowMin).toBe(90)
  })
})
