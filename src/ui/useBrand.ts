import { useCallback, useEffect, useState } from 'react'
import { parseBrand, PLAIN_BRAND, type Brand } from '../capture/brand'
import { get, putAll } from '../ledger/db'

// The receipt look lives in this browser only, like the shop's rules.
export function useBrand() {
  const [brand, setBrand] = useState<Brand>(PLAIN_BRAND)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    get('settings', 'brand').then(
      (row) => live && row && setBrand(parseBrand(row)),
      (e: unknown) => live && setError(String(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const save = useCallback(async (next: Brand) => {
    await putAll({ settings: [{ id: 'brand', ...next }] })
    setBrand(next)
  }, [])

  return { brand, error, save }
}

export type BrandApi = ReturnType<typeof useBrand>
