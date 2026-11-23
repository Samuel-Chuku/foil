// The few extension APIs we use, declared here instead of pulling in @types/chrome.
declare namespace chrome.sidePanel {
  function setPanelBehavior(behavior: {
    openPanelOnActionClick: boolean
  }): Promise<void>
  function open(options: { tabId?: number; windowId?: number }): Promise<void>
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

declare namespace chrome.runtime {
  // Undefined once the extension is reloaded under an open page.
  const id: string | undefined
  type MessageSender = { tab?: { id?: number } }
  function sendMessage(message: unknown): Promise<unknown>
  function getContexts(filter: {
    contextTypes?: 'OFFSCREEN_DOCUMENT'[]
  }): Promise<{ contextType: string }[]>
  const onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => boolean | void,
    ): void
    removeListener(listener: (...args: never[]) => unknown): void
  }
}

declare namespace chrome.tabs {
  function sendMessage(tabId: number, message: unknown): Promise<unknown>
}

declare namespace chrome.offscreen {
  function createDocument(parameters: {
    url: string
    reasons: 'LOCAL_STORAGE'[]
    justification: string
  }): Promise<void>
}
