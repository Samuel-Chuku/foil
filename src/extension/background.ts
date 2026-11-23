import { isWriteAsk, type ToWriter, type WriteAnswer } from './bridge'

// Clicking the toolbar icon opens the side panel instead of a popup.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => undefined)

// The desk's writer page, made the first time WhatsApp asks for writing help
// and kept while the browser runs.
const WRITER = 'src/extension/writer.html'
let opening: Promise<void> | null = null
async function writer(): Promise<void> {
  const open = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  })
  if (open.length > 0) return
  opening ??= chrome.offscreen
    .createDocument({
      url: WRITER,
      reasons: ['LOCAL_STORAGE'],
      justification:
        "Reads the vendor's desk settings and rewrites their typed reply on their click.",
    })
    .finally(() => {
      opening = null
    })
  await opening
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // The floating desk opens the panel on the vendor's click. open() must run
  // while Chrome still counts the click, so nothing is awaited before it.
  const m = message as { kind?: string }
  if (m?.kind === 'open-panel' && sender.tab?.id !== undefined) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined)
    return
  }
  if (!isWriteAsk(message) || sender.tab?.id === undefined) return
  const forward: ToWriter = { kind: 'writer', ask: message }
  void writer()
    .then(() => chrome.runtime.sendMessage(forward))
    .then(reply, (e: unknown) =>
      reply({
        kind: 'error',
        message: `The desk's writer did not start (${e instanceof Error ? e.message : String(e)}). Reload the extension and try again.`,
      } satisfies WriteAnswer),
    )
  return true
})
