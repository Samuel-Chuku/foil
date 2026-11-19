// The few extension APIs we use, declared here instead of pulling in @types/chrome.
declare namespace chrome.sidePanel {
  function setPanelBehavior(behavior: {
    openPanelOnActionClick: boolean
  }): Promise<void>
}
