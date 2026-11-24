import { InferenceSource } from 'firebase/ai'
import { describe, expect, it, vi } from 'vitest'
import type { CloudRequest } from '../cloud/approval'
import { approve } from '../cloud/approval'
import { jobRunner, OFFLINE, onDevice, type Gate } from './job'
import { sourceOf } from './run'

const request: CloudRequest = {
  feature: 'Draft a reply',
  reason: 'Testing.',
  texts: ['Hello (customer)'],
  replaced: ['names'],
}

function gate(over: Partial<Gate> = {}) {
  const g = {
    cloudConsent: vi.fn(() => false),
    ready: vi.fn(() => Promise.resolve()),
    online: vi.fn(() => true),
    ask: vi.fn((r: CloudRequest) => Promise.resolve(approve(r))),
    ...over,
  }
  return g
}

describe('device jobs', () => {
  it('never open the dialog and get consent only from the gate', async () => {
    const g = gate({ cloudConsent: vi.fn(() => true) })
    const work = vi.fn((consent: boolean) => Promise.resolve(consent))
    await expect(jobRunner(g)(onDevice(work))).resolves.toBe(true)
    expect(g.ready).toHaveBeenCalledOnce()
    expect(g.ask).not.toHaveBeenCalled()
    expect(work).toHaveBeenCalledWith(true)
  })

  it('do not run when the model is not ready', async () => {
    const g = gate({ ready: () => Promise.reject(new Error('no model')) })
    const work = vi.fn(() => Promise.resolve('x'))
    await expect(jobRunner(g)(onDevice(work))).rejects.toThrow('no model')
    expect(work).not.toHaveBeenCalled()
  })

  it('run offline, since nothing leaves the computer', async () => {
    const g = gate({ online: () => false })
    await expect(
      jobRunner(g)(onDevice(() => Promise.resolve('ok'))),
    ).resolves.toBe('ok')
  })
})

describe('cloud jobs', () => {
  it('send only the request the vendor approved', async () => {
    const order: string[] = []
    const g = gate({
      ask: vi.fn((r: CloudRequest) => {
        order.push('ask')
        return Promise.resolve(approve(r))
      }),
    })
    const work = vi.fn((a: CloudRequest) => {
      order.push('send')
      return Promise.resolve(a.texts)
    })
    const result = await jobRunner(g)({ where: 'cloud', request, run: work })
    expect(order).toEqual(['ask', 'send'])
    expect(g.ask).toHaveBeenCalledWith(request)
    expect(result).toEqual(request.texts)
    expect(g.ready).not.toHaveBeenCalled()
  })

  it('send nothing when the vendor cancels', async () => {
    const g = gate({ ask: vi.fn(() => Promise.resolve(null)) })
    const work = vi.fn(() => Promise.resolve('sent'))
    await expect(
      jobRunner(g)({ where: 'cloud', request, run: work }),
    ).resolves.toBeNull()
    expect(work).not.toHaveBeenCalled()
  })

  it('send nothing and ask nothing when offline', async () => {
    const g = gate({ online: () => false })
    const work = vi.fn(() => Promise.resolve('sent'))
    await expect(
      jobRunner(g)({ where: 'cloud', request, run: work }),
    ).rejects.toThrow(OFFLINE)
    expect(g.ask).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })

  it('skip the dialog only for a request already shown as sent', async () => {
    const g = gate()
    const work = vi.fn((a: CloudRequest) => Promise.resolve(a))
    const sent = await jobRunner(g)({
      where: 'cloud',
      request,
      shown: true,
      run: work,
    })
    expect(g.ask).not.toHaveBeenCalled()
    expect(sent).toEqual(request)
    expect(Object.isFrozen(sent)).toBe(true)
  })
})

describe('the source badge', () => {
  it('comes from the SDK response', () => {
    expect(sourceOf({ inferenceSource: InferenceSource.ON_DEVICE })).toBe(
      'On device',
    )
    expect(sourceOf({ inferenceSource: InferenceSource.IN_CLOUD })).toBe(
      'Cloud',
    )
  })

  it('never claims the device when the SDK does not say so', () => {
    expect(sourceOf({})).toBe('Cloud')
  })
})
