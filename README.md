Private Distro
==============

Private Distro is a Next.js application that lets you run a lightweight front-end and relay for Privacy Cash deposits and withdrawals on Solana. The client spins up a dedicated deposit wallet in the browser, connects to a Phantom wallet for funding, and hands batches of payouts to a serverless API that talks to the `privacycash` SDK.

Features
--------
- Generates a bs58-encoded owner keypair in the browser and persists it locally.
- Connects to Phantom to fund the deposit wallet with a fee buffer for relayer costs.
- Tracks the private pool balance and recent activity in real time.
- Builds batched withdrawals and submits them through the Privacy Cash SDK.
- Emits detailed relay logs to help diagnose RPC or relayer failures.

How It Works
------------
1. **Client bootstrap:** On first load the UI creates a Solana `Keypair`, stores the secret in `localStorage`, and shows the public deposit address. The default RPC endpoint is taken from `NEXT_PUBLIC_SOLANA_RPC_URL` and falls back to `https://api.mainnet-beta.solana.com`.
2. **Deposits:** When you enter an amount and confirm with Phantom, the app signs a transfer that includes a `0.001 SOL` buffer so the generated wallet can pay relayer fees. After the transaction finalizes, the client calls the `/api/private-cash` endpoint with the deposit amount.
3. **Server relay:** The API route in `pages/api/private-cash` instantiates the `PrivacyCash` client with the provided RPC URL and owner secret, clears any cached state, and performs deposits, withdrawals, or balance checks. It returns normalized responses to the front-end.
4. **Withdrawals:** You can queue any number of payout addresses and amounts. The API sends each withdrawal through the SDK, surfaces signatures, fees, and partial status flags, and returns the updated private balance.

Project Layout
--------------
- `app/` – Next.js App Router pages, global styling, and the main React UI.
- `pages/api/private-cash` – Serverless handler that wraps the `privacycash` SDK.
- `next.config.ts` – Ensures required WASM and ZKey artifacts ship with the API bundle.
- `public/` – Static assets.
- `amplify.yml` – Build definition for deploying to AWS Amplify (Node.js 20).

Prerequisites
-------------
- Node.js 20.x (the project aligns with the AWS Amplify build).
- npm 9+ (or another compatible package manager).
- A Phantom browser wallet with SOL for deposits.
- Access to a Solana RPC endpoint. Override the default by setting `NEXT_PUBLIC_SOLANA_RPC_URL` in `.env.local`.

Local Development
-----------------
1. Install dependencies:
   ```
   npm install
   ```
2. Optionally create `.env.local` and set `NEXT_PUBLIC_SOLANA_RPC_URL`.
3. Start the dev server:
   ```
   npm run dev
   ```
4. Visit `http://localhost:3000`, connect Phantom, and follow the on-screen flow.

Production Build
----------------
```
npm run build
npm run start
```
The repository includes `amplify.yml` for AWS Amplify hosting. Other platforms simply need Node.js 20, the build output in `.next`, and the same environment variable configuration.

Operational Notes
-----------------
- The owner secret stays in the browser; treat the storage context as sensitive.
- RPC reliability directly affects relay stability. Prefer a low-latency Solana RPC provider.
- Monitor the "Relay log" panel in the UI when diagnosing failed deposits or withdrawals.

License
-------
MIT License. You are free to use, modify, and distribute this software under the terms of the MIT License.


