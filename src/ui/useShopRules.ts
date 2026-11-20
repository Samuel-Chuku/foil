import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_RULES,
  normaliseRules,
  type ShopRules,
} from '../capture/shopRules'
import { get, putAll } from '../ledger/db'

// The shop's rules live in this browser only, like its customers and orders.
export function useShopRules() {
  const [rules, setRules] = useState<ShopRules>(EMPTY_RULES)
  // Null while loading; false until the vendor has saved rules once.
  const [stored, setStored] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    get('settings', 'shop-rules').then(
      (row) => {
        if (!live) return
        if (row) setRules(normaliseRules(row))
        setStored(Boolean(row))
      },
      (e: unknown) => live && setError(String(e)),
    )
    return () => {
      live = false
    }
  }, [])

  const save = useCallback(async (next: ShopRules) => {
    await putAll({ settings: [{ id: 'shop-rules', ...next }] })
    setRules(next)
    setStored(true)
  }, [])

  return { rules, stored, error, save }
}

export type ShopRulesApi = ReturnType<typeof useShopRules>
