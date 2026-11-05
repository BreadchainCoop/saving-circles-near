# Saving Circles contract (NEAR)

A rotating savings circle for NEP-141 tokens such as USDC. A circle has a fixed deposit
amount, a deposit interval and up to 25 members. Each round every member deposits, and the
member whose turn it is withdraws the pot (deposit amount × members). After as many rounds
as there are members, everyone has been paid once.

Ported from the Solidity contract in
[`reference/evm/src/contracts/SavingCircles.sol`](../reference/evm/src/contracts/SavingCircles.sol).
Panic messages reuse the Solidity error names (`NotWithdrawable`, `CircleTimedOut`, …).

## Build and test

```sh
cargo test                              # unit tests
cargo near build non-reproducible-wasm  # wasm in target/near/
```

Requires Rust and [cargo-near](https://github.com/near/cargo-near).

## Using it

| Action | Call | Who |
|---|---|---|
| Allow a token | `set_token_allowed(token, allowed)` | contract owner |
| Create a circle | `create({ args: { token, deposit_amount, deposit_interval, owner? } })` + NEAR for storage | anyone |
| Add members | `add_members(circle_id, members)` + NEAR for storage | circle owner, before start |
| Remove a member | `remove_member(circle_id, member)` | circle owner, or the member, before start |
| Start | `start(circle_id)` + NEAR for storage | circle owner |
| Deposit | `ft_transfer_call` on the token, `receiver_id` = this contract, `msg` = `{"circle_id":"0"}` | any member; add `"member"` to pay for someone else |
| Withdraw | `withdraw(circle_id)` or `withdraw_for(circle_id, member)` | the member, or anyone on their behalf |
| End a stalled circle | `decommission(circle_id)` | any member, after a round closes with deposits missing |
| Collect a refund | `claim_refund(circle_id, member)` | anyone, after decommissioning |

Views: `get_circle`, `get_circles`, `get_member_circles`, `get_circle_members`, `get_member`,
`get_member_balances`, `check_memberships`, `circle_state`, `round_state`,
`current_round_withdrawer`, `is_withdrawable`, `is_member_withdrawable`, `is_decommissionable`,
`is_decommissioned`, `is_active`, `is_token_allowed`, `get_allowed_tokens`, `next_id`, `owner_id`.

JSON conventions: ids, amounts and times are strings (`U64`, `U128`). Times and
`deposit_interval` are in **nanoseconds**, matching NEAR block timestamps.

Events follow [NEP-297](https://github.com/near/NEPs/blob/master/neps/nep-0297.md) with
standard `saving_circles`.

### Setup before use

- The contract must be registered with each allowed token (`storage_deposit` on the token)
  to receive deposits.
- Members must be registered with the token to receive payouts and refunds. If they are not,
  the transfer fails and the payout or refund is restored, so it can be retried.

## Design

- **One record per circle.** A circle and its members, with each member's deposit for every
  round, are stored together. The 25-member cap keeps that record small enough to load on
  every call.
- **Storage is paid by whoever adds it.** `create`, `add_members` and `start` measure the
  storage they add, charge it to the attached deposit and refund the rest. `start` allocates
  the full deposit table (members² × 16 bytes), so deposits never grow storage.
- **Deposits arrive by `ft_transfer_call`.** NEP-141 has no allowances, so the token calls
  `ft_on_transfer` with the circle id in `msg`. Any rejection panics, and the token then
  returns the full amount to the sender.
- **Payouts are asynchronous.** `withdraw` marks the claim and sends `ft_transfer`. If the
  transfer fails, `on_payout` restores the claim. `FundsWithdrawn` is emitted only once the
  transfer has succeeded; a failure emits `PayoutFailed`.

## Differences from the Solidity contract

| Solidity | NEAR | Why |
|---|---|---|
| `deposit` / `depositFor` pull tokens with `transferFrom` | Deposits go through the token's `ft_transfer_call` | NEP-141 has no allowances |
| `decommission` transfers every refund | `decommission` records refunds; `claim_refund` pays each one | 25 transfers with callbacks don't fit in one call's 300 TGas limit |
| `start` can be called again on a finished circle | A circle can be started only once | Restarting a finished circle accepts deposits that can never be paid out |
| Payout is a synchronous transfer | Payout is a transfer plus a callback that undoes the claim on failure | NEAR cross-contract calls are asynchronous |
| Upgradeable proxy, reentrancy guard | Neither | NEAR contracts are redeployed in place; there is no synchronous reentrancy |
| Storage paid by gas | Storage paid by attached NEAR on `create`, `add_members` and `start` | NEAR storage staking. Storage freed by `remove_member` is not refunded |
| Timestamps and `depositInterval` in seconds | Nanoseconds | NEAR block timestamps |
| `getMemberBalances` returns two arrays | Returns `[{ account_id, balance }]` | Easier to use from JSON |
| `getCircles` returns zeroed structs for unknown ids | Returns `null` for unknown ids | Easier to use from JSON |
| `hasClaimed`, `lastDepositRound`, `memberIndex`, `roundDeposits` | One `get_member` view | Fewer RPC calls |
| `roundState` sets `NotStarted` for a not-yet-open round, then always overwrites it | Same result, without the dead branch | Same behavior |
| `redeemInvite` (EIP-712 signed invites) | Not ported yet | Tracked in [#15](https://github.com/BreadchainCoop/saving-circles-near/issues/15) |

`AutomaticSavingCircles`, `GoalSavingCircles` and `ConditionalGrants` are not part of this
contract. Automation is tracked in [#16](https://github.com/BreadchainCoop/saving-circles-near/issues/16),
the other two in [#19](https://github.com/BreadchainCoop/saving-circles-near/issues/19).
