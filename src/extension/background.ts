// Clicking the toolbar icon opens the side panel instead of a popup.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => undefined)

// The floating desk on WhatsApp Web opens the panel on the vendor's click.
// open() must run while Chrome still counts the click, so nothing is awaited
// before it.
chrome.runtime.onMessage.addListener((message, sender) => {
  const m = message as { kind?: string }
  if (m?.kind !== 'open-panel' || sender.tab?.id === undefined) return
  chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined)
})
