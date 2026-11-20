// The few extension APIs we use, declared here instead of pulling in @types/chrome.
declare namespace chrome.sidePanel {
  function setPanelBehavior(behavior: {
    openPanelOnActionClick: boolean
  }): Promise<void>
}

declare namespace chrome.identity {
  function getRedirectURL(path?: string): string
  function launchWebAuthFlow(details: {
    url: string
    interactive?: boolean
    abortOnLoadForNonInteractive?: boolean
    timeoutMsForNonInteractive?: number
  }): Promise<string | undefined>
}
