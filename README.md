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
contracts/      NEAR smart contract (Rust, near-sdk) — hackathon work
web/            Frontend — baseline, being moved from EVM to NEAR
reference/evm/  Solidity original — baseline, read-only
```

## Try it

_To be written: a hosted demo link and "do X, see Y" steps a judge can follow._

## Libraries and tools

Baseline code from Bread is listed above. Third-party libraries used by the hackathon work:

_To be listed as they are added._

## Other submissions

_None. If the team submits a second project, it will be named here (rule Q-015)._

## License

[MIT](LICENSE). The imported baseline keeps its original license files in
`reference/evm/LICENSE` and `web/LICENSE`.
