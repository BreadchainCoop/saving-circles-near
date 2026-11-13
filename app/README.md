# Saving Circles on NEAR: frontend

A lean, NEAR-first frontend for the Saving Circles contract in `../contracts`.
It is a static Next.js export: no server, no database, no API keys.

## Run

```sh
pnpm install
pnpm dev        # http://localhost:3002
pnpm build      # static site in out/
```

No `.env` needed. The app defaults to NEAR testnet, with the contract and token from
`../deployments/testnet.json`. `NEXT_PUBLIC_NEAR_NETWORK=mainnet` switches the network; on
mainnet `NEXT_PUBLIC_CONTRACT_ID` and `NEXT_PUBLIC_TOKEN_ID` are required, and the testnet
faucet button is hidden. All settings are in `.env.example` and are read at build time.

Hosted at https://saving-circles.netlify.app (Netlify, configured by `netlify.toml`).

## Try it on testnet

1. Connect a testnet wallet (MyNearWallet, Meteor or HERE).
2. Click **Get tUSDC** to mint 100 test tUSDC; the test token mints to anyone.
3. Open the demo circle, or create one under **New circle**, add members, start it.
4. Each round every member deposits; the member whose turn it is withdraws the pot.

## Layout

```
src/lib/near/config.ts    network, contract, token (from deployments/testnet.json)
src/lib/near/rpc.ts       read-only views over JSON-RPC, no wallet needed
src/lib/near/circles.ts   typed views and call builders for the contract
src/lib/near/token.ts     NEP-141 balance, storage registration, testnet mint
src/providers/wallet.tsx  NEAR Wallet Selector: sign in, sign and send calls
src/app/                  home, /new, /circle?id=
```

## Third-party libraries

| Library | Use |
|---|---|
| `next`, `react`, `react-dom` | App framework, static export |
| `@near-wallet-selector/core`, `modal-ui`, `my-near-wallet`, `meteor-wallet`, `here-wallet` | Wallet sign-in and transaction signing |
| `@near-js/transactions` | Builds function-call actions for the wallet |
| `near-api-js` | Required by the Meteor wallet module (peer dependency) |
| `@tanstack/react-query` | Caching and refetching contract views |
| `@breadcoop/ui` | Bread theme and fonts (CSS only) |
| `@phosphor-icons/react` | Icons, same set as the Bread apps |
| `tailwindcss`, `clsx`, `tailwind-merge` | Styling |
