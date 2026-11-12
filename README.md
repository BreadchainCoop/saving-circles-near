# Saving Circles on NEAR

Rotating savings circles (ROSCAs) on NEAR. A group agrees on a deposit amount and a
schedule; each round every member deposits and one member takes the pot, until everyone
has been paid. No bank, no organizer holding the money, no one who can switch it off.

Built by [Bread Cooperative](https://bread.coop) for **NEAR HACKATHON** (1–14 Nov 2026).

- **Tracks:** Social Money (`social`), Real-World Money (`realworld`)
- **Status:** in development

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
(`contracts/`), CI workflows and git hooks.

Both source repos received Bread commits between the hackathon announcement
(19 Oct 2026) and the import. Those commits are EVM work, belong to the baseline, and are
not claimed as hackathon work.

**Hackathon work:** everything after the `pre-hackathon` tag.

- Full diff: [`pre-hackathon...hackathon-submission`](https://github.com/BreadchainCoop/saving-circles-near/compare/pre-hackathon...hackathon-submission)
  (until the submission tag exists: [`pre-hackathon...main`](https://github.com/BreadchainCoop/saving-circles-near/compare/pre-hackathon...main))

## Repository layout

```
app/            NEAR frontend (Next.js static export) — hackathon work
contracts/      NEAR smart contract (Rust, near-sdk) and a test token — hackathon work
scripts/        Testnet deploy and demo seeding — hackathon work
deployments/    Deployed contract addresses, read by the frontend
web/            Previous EVM frontend — baseline, not used by the NEAR app
reference/evm/  Solidity original — baseline, read-only
```

## Try it

_A hosted demo link and "do X, see Y" steps for judges are still to come._

### Testnet deployment

| | Account |
|---|---|
| Saving Circles contract | [`circles.bread-saving-circles.testnet`](https://testnet.nearblocks.io/address/circles.bread-saving-circles.testnet) |
| Test USDC (tUSDC, 6 decimals, open mint) | [`usdc.bread-saving-circles.testnet`](https://testnet.nearblocks.io/address/usdc.bread-saving-circles.testnet) |

Testnet has no canonical USDC, so the deployment uses a test token that anyone can mint, up to
10,000 tUSDC per call:

```sh
near contract call-function as-transaction usdc.bread-saving-circles.testnet mint \
  json-args '{"account_id":"you.testnet","amount":"100000000"}' \
  prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as you.testnet network-config testnet sign-with-legacy-keychain send
```

Circle `0` is a live demo circle. Its three members have completed round 0, and the first
member has been paid. Read it with:

```sh
near contract call-function as-read-only circles.bread-saving-circles.testnet get_circle \
  json-args '{"circle_id":"0"}' network-config testnet now
```

### Build, test and deploy it yourself

Requires Rust, [cargo-near](https://github.com/near/cargo-near) and
[near-cli-rs](https://github.com/near/near-cli-rs).

```sh
cd contracts
cargo near build non-reproducible-wasm
cargo near build non-reproducible-wasm --manifest-path mock-ft/Cargo.toml
cargo test --workspace   # unit tests, plus integration tests in a local NEAR sandbox
cd ..

# A faucet-funded testnet account, then your own deployment and demo circle:
near account create-account sponsor-by-faucet-service you.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
NEAR_ACCOUNT=you.testnet scripts/deploy-testnet.sh
NEAR_ACCOUNT=you.testnet scripts/seed-demo.sh
```

The NEAR sandbox runs on Linux and Apple Silicon only, not on Intel macOS. CI runs every test
on each pull request.

## Libraries and tools

Baseline code from Bread is listed above. Third-party libraries used by the hackathon work:

| Library | Used for | License |
|---|---|---|
| [near-sdk](https://crates.io/crates/near-sdk) 5.30 | Contract framework | MIT OR Apache-2.0 |
| [near-contract-standards](https://crates.io/crates/near-contract-standards) 5.30 | NEP-141 token interfaces | MIT OR Apache-2.0 |
| [cargo-near](https://github.com/near/cargo-near) | Building the contract wasm | MIT OR Apache-2.0 |
| [near-workspaces](https://crates.io/crates/near-workspaces) 0.24 | Integration tests in a local NEAR sandbox | MIT OR Apache-2.0 |
| [tokio](https://crates.io/crates/tokio), [anyhow](https://crates.io/crates/anyhow), [serde_json](https://crates.io/crates/serde_json) | Integration test runtime and helpers | MIT (tokio); MIT OR Apache-2.0 |
| [near-cli-rs](https://github.com/near/near-cli-rs) | Testnet deploy and demo scripts | MIT OR Apache-2.0 |

## Other submissions

Bread Cooperative is also submitting
[sigstack-near](https://github.com/BreadchainCoop/sigstack-near), an independent project
(rule Q-015).

## License

[MIT](LICENSE). The imported baseline keeps its original license files in
`reference/evm/LICENSE` and `web/LICENSE`.
