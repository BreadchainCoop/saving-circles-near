# Saving Circles on NEAR

Rotating savings circles (ROSCAs, also known as tandas, susus or chit funds) on NEAR. A group
agrees on a deposit amount and a schedule. Each round every member deposits and one member
takes the whole pot, until everyone has been paid once. Offline, an organizer holds the cash
and the group has to trust them. Here a NEAR contract holds the pot and enforces the order:

- deposits go straight to the contract,
- only the member whose turn it is can withdraw,
- if someone misses a round, everyone can take back what they put in.

Built by [Bread Cooperative](https://bread.coop) for **NEAR HACKATHON** (1–14 Nov 2026).

- **Live demo:** https://saving-circles.netlify.app (NEAR testnet)
- **Tracks:** Social Money (`social`), Real-World Money (`realworld`)
- **Network:** NEAR testnet, with a test stablecoin (tUSDC)
- **Status:** in development

## Try it

Open **https://saving-circles.netlify.app**. It is the `app/` frontend, running against the
testnet contract below. To run the same app locally, see
[Run it locally](#run-it-locally).

### In the browser: do X, see Y

You need a testnet wallet, such as [MyNearWallet](https://testnet.mynearwallet.com) or Meteor.
For a whole circle, use two testnet accounts, in two browsers or one after the other.

| Do | See |
|---|---|
| Open the app | **All circles** lists every circle on the contract, newest first. Circle `0` is the seeded demo circle. |
| Open circle `0` | Members `alice`, `bob` and `carol` `.bread-saving-circles.testnet`, the round number, a countdown to the round's end, who has deposited this round, and "1 of 3 rounds paid out" (or more, see [automation](#automatic-deposits-and-claims)). No wallet needed. |
| **Sign in** | Your account ID and tUSDC balance appear in the top bar. |
| **Get tUSDC**, approve in the wallet | Your balance goes up by 100 tUSDC. The test token mints to anyone. |
| **Start a circle**: deposit 1, interval **Testing** (5 minutes), add your second account, **Create circle** | The new circle's page: **Not started**, both members listed, "Ready when you are". |
| **Start circle** | **Collecting deposits**, round 1 of 2, a 5-minute countdown. |
| **Deposit** from each account | "Deposits made by" counts up to 2 of 2. Each deposit is one wallet approval. |
| As the first member, **Withdraw the pot** | Your balance goes up by 2 tUSDC and the circle shows "1 of 2 rounds paid out". |
| Let the next round end without a deposit | "A deposit was missed". **End circle**, then **Claim refund**, pays each member back what they are owed. |

### Without a wallet: read the live contract

With [near-cli-rs](https://github.com/near/near-cli-rs), no account needed:

```sh
C=circles.bread-saving-circles.testnet
near contract call-function as-read-only $C get_circle json-args '{"circle_id":"0"}' network-config testnet now
near contract call-function as-read-only $C get_member \
  json-args '{"circle_id":"0","member":"alice.bread-saving-circles.testnet"}' network-config testnet now
near contract call-function as-read-only $C get_due json-args '{"circle_id":"0"}' network-config testnet now
```

`get_circle` shows the three members, the 10 tUSDC deposit and the 7-day interval in
nanoseconds. `get_member` shows Alice's deposits per round and `"has_claimed": true`: she
took the round 0 pot. `get_due` lists the deposits and payouts a keeper would run now.

The deployed code is verified: the contract's **Contract** tab on
[NearBlocks](https://testnet.nearblocks.io/address/circles.bread-saving-circles.testnet)
shows it was rebuilt from this repository's source at the recorded commit.

### Automatic deposits and claims

Members can turn on automation and pre-fund their deposits. After that, anyone can call
`process_due(circle_id)` to move each member's deposit for the current round and pay the pot
to the member whose round has ended. Bread runs a keeper that calls it every minute as
[`bread-keeper.testnet`](https://testnet.nearblocks.io/address/bread-keeper.testnet). That
account's key is a NEAR function-call access key: it can call only `process_due` on this
contract, and spend at most 1 NEAR on gas. It cannot move anyone's tokens. The keeper's
`process_due` transactions appear on its NearBlocks page. There is no automation UI in the app
yet; the calls are listed in [`contracts/README.md`](contracts/README.md#automatic-deposits-and-claims).

`scripts/seed-demo.sh` turns automation on for the demo members, so the keeper runs the
demo circle's remaining rounds and pays out Bob and then Carol.

### Where each claim is tested

`cargo test --workspace` runs 40 unit tests and 6 integration tests. The integration tests
deploy the real wasm, plus a NEP-141 test token, to a local NEAR sandbox:

| Claim | Integration test in [`contracts/tests/integration.rs`](contracts/tests/integration.rs) |
|---|---|
| A full circle pays every member exactly once | `full_circle_pays_every_member_once` |
| A rejected deposit goes back to the sender | `rejected_deposits_are_returned_by_the_token` |
| A failed payout is restored and can be retried | `failed_payout_is_restored_and_can_be_retried` |
| A missed round ends the circle and everyone is refunded | `stalled_circle_is_decommissioned_and_refunded` |
| Storage is paid by whoever adds it, and the excess is refunded | `storage_must_be_paid_and_excess_is_refunded` |
| A keeper runs pre-funded deposits and payouts | `keeper_processes_prefunded_deposits_and_claims` |

## Run it locally

Requires Rust with the `wasm32-unknown-unknown` target,
[cargo-near](https://github.com/near/cargo-near), Node 22 and pnpm 11 (`corepack enable`).
The integration tests download a NEAR sandbox, which runs on Linux and Apple Silicon only, not
Intel macOS.

```sh
scripts/setup.sh          # builds the contract and test token, runs every test, builds the app
cd app && pnpm dev        # http://localhost:3002, against the testnet deployment
```

The app needs no `.env`: it reads the contract and token from
[`deployments/testnet.json`](deployments/testnet.json). The network, contract and token can be
set at build time (see [`app/.env.example`](app/.env.example)). CI runs the contract's format, lint
and test checks on every pull request that changes `contracts/`, and typechecks and builds
the app (for testnet and mainnet) on every pull request that changes `app/`.

### Deploy your own

Also requires [near-cli-rs](https://github.com/near/near-cli-rs) and Docker. The deploy
builds the contract reproducibly so NearBlocks can verify it, and it deploys only a pushed
commit.

```sh
near account create-account sponsor-by-faucet-service you.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
NEAR_ACCOUNT=you.testnet scripts/deploy-testnet.sh   # contract, test token, deployments/testnet.json
NEAR_ACCOUNT=you.testnet scripts/seed-demo.sh        # a demo circle with three members
```

To get tUSDC from the command line instead of the app's **Get tUSDC** button (up to 10,000
tUSDC per call; amounts have 6 decimals):

```sh
near contract call-function as-transaction usdc.bread-saving-circles.testnet mint \
  json-args '{"account_id":"you.testnet","amount":"100000000"}' \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as you.testnet network-config testnet sign-with-legacy-keychain send
```

## How NEAR is used

| | Account |
|---|---|
| Saving Circles contract | [`circles.bread-saving-circles.testnet`](https://testnet.nearblocks.io/address/circles.bread-saving-circles.testnet) |
| Test USDC (tUSDC, 6 decimals, open mint) | [`usdc.bread-saving-circles.testnet`](https://testnet.nearblocks.io/address/usdc.bread-saving-circles.testnet) |
| Keeper | [`bread-keeper.testnet`](https://testnet.nearblocks.io/address/bread-keeper.testnet) |

- **One Rust contract holds every circle** ([`contracts/`](contracts/), near-sdk 5). It is a
  port of Bread's Solidity contract. The [differences table](contracts/README.md#differences-from-the-solidity-contract)
  lists each change and why NEAR needed it.
- **Deposits are one transaction.** NEP-141 tokens have no `approve`/`transferFrom`. A member
  calls `ft_transfer_call` on the token, and the token calls the contract's `ft_on_transfer`
  with the circle ID. If the contract rejects the deposit (wrong amount, round already paid,
  not a member), the token standard returns the tokens to the sender in the same flow.
- **Payouts are cross-contract calls with a rollback.** `withdraw` marks the pot claimed and
  sends `ft_transfer`. If the transfer fails, for example because the member isn't
  registered with the token, a callback restores the claim so it can be retried.
- **Storage is paid in NEAR by whoever adds data.** `create`, `add_members` and `start`
  charge the storage they add to the attached NEAR and refund the rest. Deposits never grow
  storage, so a deposit costs a member only gas.
- **Automation without a trusted operator.** `process_due` is permissionless. NEAR access
  keys let the keeper hold a key that can call that one method and nothing else (see above).
- **Readable accounts.** Members are named accounts such as
  `alice.bread-saving-circles.testnet`, not hex addresses.
- **Events and verification.** The contract emits NEP-297 events (`saving_circles`) for
  deposits, payouts and automation. Its wasm carries NEP-330 source metadata and is built
  reproducibly, which lets NearBlocks verify it.
- **The frontend is static** ([`app/`](app/)): NEAR Wallet Selector for signing, and
  JSON-RPC views against the public FastNEAR testnet RPC. No backend and no API keys.

## Prior work and what is judged

Saving Circles already runs on Gnosis and Celo as Solidity contracts with a Next.js
frontend. Per the hackathon rules (Q-002 to Q-004), that EVM product is **baseline** and is
not part of this submission. **Only the NEAR integration built during the hackathon window
is submitted for judging.**

The baseline is imported in a single commit, tagged `pre-hackathon`:

| Path | Source | Commit | License |
|---|---|---|---|
| `reference/evm/` | [BreadchainCoop/saving-circles](https://github.com/BreadchainCoop/saving-circles) | [`2a668ac`](https://github.com/BreadchainCoop/saving-circles/tree/2a668ac7541bdeca8522d163ba030410fde46b1d) | MIT |
| `web/` | [BreadchainCoop/app-stacks](https://github.com/BreadchainCoop/app-stacks) | [`474e560`](https://github.com/BreadchainCoop/app-stacks/tree/474e56047d2345eead7c2aca531e6fe7bc402cb6) | MIT |

`reference/evm/` holds the Solidity contracts, tests and deploy scripts unchanged. It is
the specification the NEAR contract is ported from and is not built or deployed here.
`web/` is the existing frontend, imported without its EVM deploy scripts
(`contracts/`), CI workflows and git hooks. The NEAR app in `app/` was written during the
hackathon. It follows `web/`'s design, and a few components keep `web/`'s file names and
structure, but no file is copied unchanged.

Both source repos received Bread commits between the hackathon announcement
(19 Oct 2026) and the import. Those commits are EVM work, belong to the baseline, and are
not claimed as hackathon work.

The keeper runs on Bread's existing keeper service,
[BreadchainCoop/keepers](https://github.com/BreadchainCoop/keepers) (baseline). Its NEAR job
was written during the hackathon on the `near-hackathon` branch:
[`main...near-hackathon`](https://github.com/BreadchainCoop/keepers/compare/main...near-hackathon).

**Hackathon work:** everything after the `pre-hackathon` tag.

- Full diff: [`pre-hackathon...hackathon-submission`](https://github.com/BreadchainCoop/saving-circles-near/compare/pre-hackathon...hackathon-submission)
  (until the submission tag exists: [`pre-hackathon...main`](https://github.com/BreadchainCoop/saving-circles-near/compare/pre-hackathon...main))

## Repository layout

```
app/            NEAR frontend (Next.js static export) — hackathon work
contracts/      NEAR smart contract (Rust, near-sdk) and a test token — hackathon work
scripts/        Setup, testnet deploy and demo seeding — hackathon work
deployments/    Deployed contract addresses, read by the frontend
web/            Previous EVM frontend — baseline, not used by the NEAR app
reference/evm/  Solidity original — baseline, read-only
```

## Libraries and tools

Baseline code from Bread is listed above. Third-party libraries and services used by the
hackathon work (rule Q-005):

| Library | Used for | License |
|---|---|---|
| [near-sdk](https://crates.io/crates/near-sdk) 5.30 | Contract framework | MIT OR Apache-2.0 |
| [near-contract-standards](https://crates.io/crates/near-contract-standards) 5.30 | NEP-141 token interfaces | MIT OR Apache-2.0 |
| [cargo-near](https://github.com/near/cargo-near) 0.22 | Building the contract wasm | MIT OR Apache-2.0 |
| [sourcescan/cargo-near](https://hub.docker.com/r/sourcescan/cargo-near) Docker image | Reproducible contract build for NearBlocks verification | Packages cargo-near and Rust |
| [near-workspaces](https://crates.io/crates/near-workspaces) 0.24 | Integration tests in a local NEAR sandbox | MIT OR Apache-2.0 |
| [tokio](https://crates.io/crates/tokio), [anyhow](https://crates.io/crates/anyhow), [serde_json](https://crates.io/crates/serde_json) | Integration test runtime and helpers | MIT (tokio); MIT OR Apache-2.0 |
| [near-cli-rs](https://github.com/near/near-cli-rs) | Deploy and demo scripts, and the keeper | MIT OR Apache-2.0 |
| [Next.js](https://nextjs.org) 15, [React](https://react.dev) 19 | Frontend framework, static export | MIT |
| [NEAR Wallet Selector](https://github.com/near/wallet-selector) 10 (core, modal-ui, MyNearWallet, Meteor, HERE/HOT) | Wallet sign-in and signing | MIT OR Apache-2.0 |
| [@near-js/transactions](https://www.npmjs.com/package/@near-js/transactions) 2, [near-api-js](https://github.com/near/near-api-js) 6 | Function-call actions; peer dependency of the Meteor module | ISC; MIT AND Apache-2.0 |
| [TanStack Query](https://tanstack.com/query) 5 | Caching and refetching contract views | MIT |
| [@breadcoop/ui](https://www.npmjs.com/package/@breadcoop/ui) 2 | Bread theme and fonts (CSS only); Bread's own library, baseline | P2P (as published on npm) |
| [Phosphor Icons](https://phosphoricons.com), [Tailwind CSS](https://tailwindcss.com) 4, clsx, tailwind-merge | Icons and styling | MIT |
| [FastNEAR](https://fastnear.com) public RPC | Contract views from the frontend (rule Q-009) | Free public service |

Code in this repository was written with AI coding assistants (Claude Code), which the rules
allow (Q-005).

## Other submissions

Bread Cooperative is also submitting
[sigstack-near](https://github.com/BreadchainCoop/sigstack-near), an independent project
(rule Q-015).

## License

[MIT](LICENSE). The imported baseline keeps its original license files in
`reference/evm/LICENSE` and `web/LICENSE`.
