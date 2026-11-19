# Vendor payment desk (working title)

A Chrome extension that helps small businesses selling on WhatsApp verify bank-transfer payments. On the seller's click, it reads a customer's payment screenshot on the seller's own device with Firebase AI Logic hybrid inference, checks whether the money actually arrived, captures the order and delivery details, and drafts a reply for the seller to send. Only items the seller approves are sent to the cloud.

Work in progress for #BuildHybridAI 2026.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Firebase web app config and reCAPTCHA Enterprise site key.
3. `npm run dev`, then open the printed URL in desktop Chrome.

On first run in development, the App Check SDK prints a debug token in the browser console. Register it in the Firebase console under App Check > Apps > Manage debug tokens, then put it in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN`.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
