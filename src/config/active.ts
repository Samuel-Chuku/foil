import { DEFAULT_APP_CONFIG, type AppConfig } from './parse'

// The configuration this session runs on. It is set once, before the first
// render, so the rules never change while a vendor is mid-way through a day.
let active: AppConfig = DEFAULT_APP_CONFIG

export function appConfig(): AppConfig {
  return active
}

export function setAppConfig(config: AppConfig): void {
  active = config
}
