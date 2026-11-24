// Asks Chrome for the microphone on behalf of the side panel, which cannot
// show the prompt itself. Once allowed here, the panel may use it too.
const said = document.getElementById('said')!
const allow = document.getElementById('allow') as HTMLButtonElement

async function ask() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    said.textContent =
      'Done. Go back to Foil and press Speak again. This tab closes by itself.'
    allow.hidden = true
    setTimeout(() => window.close(), 2500)
  } catch {
    said.textContent =
      'The microphone is still blocked. Click the icon at the left of the address bar, allow the microphone, then press the button again.'
  }
}

allow.addEventListener('click', () => void ask())
void ask()
