// Whether Foil may use the network. The browser's own answer, unless the
// hosted demo's "Try it offline" switch is on: then every cloud step, books
// update and download behaves exactly as with the connection gone, so judges
// can see what still runs on the computer without turning off their Wi-Fi.

let simulated = false

export const isOnline = (): boolean => navigator.onLine && !simulated

export const offlineSimulated = (): boolean => simulated

// Fires the window's own online and offline events, so everything that
// already listens for a real outage reacts to the switch the same way.
export function simulateOffline(off: boolean): void {
  if (simulated === off) return
  simulated = off
  window.dispatchEvent(new Event(off ? 'offline' : 'online'))
}
