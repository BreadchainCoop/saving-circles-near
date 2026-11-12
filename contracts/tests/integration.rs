//! End-to-end tests against a local NEAR sandbox: the real wasm, a real NEP-141 token,
//! real cross-contract calls and callbacks. Build both wasm files before `cargo test`.

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

/// 10 tUSDC at 6 decimals.
const DEPOSIT: u128 = 10_000_000;
/// Five minutes in nanoseconds: long enough that a round never rolls over mid-test.
const INTERVAL: u64 = 300_000_000_000;
const STORAGE: NearToken = NearToken::from_millinear(100);

/// Reads a wasm built by `cargo near build`. Tests use the same artifact that gets deployed
/// rather than rebuilding, which would need the cargo-near CLI inside `cargo test`.
fn wasm(path: &str, build: &str) -> Vec<u8> {
    let full = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(path);
    std::fs::read(&full).unwrap_or_else(|_| {
        panic!(
            "{} not found; build it first with `{build}`",
            full.display()
        )
    })
}

fn circles_wasm() -> Vec<u8> {
    wasm(
        "target/near/saving_circles.wasm",
        "cargo near build non-reproducible-wasm",
    )
}

fn ft_wasm() -> Vec<u8> {
    wasm(
        "target/near/mock_ft/mock_ft.wasm",
        "cargo near build non-reproducible-wasm --manifest-path mock-ft/Cargo.toml",
    )
}

struct Env {
    worker: Worker<Sandbox>,
    circles: Contract,
    ft: Contract,
}

impl Env {
    async fn new() -> anyhow::Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let ft = worker.dev_deploy(&ft_wasm()).await?;
        ft.call("new")
            .args_json(json!({ "name": "Test USDC", "symbol": "tUSDC", "decimals": 6 }))
            .transact()
            .await?
            .into_result()?;

        let circles = worker.dev_deploy(&circles_wasm()).await?;
        circles
            .call("new")
            .args_json(json!({ "owner_id": circles.id() }))
            .transact()
            .await?
            .into_result()?;
        circles
            .call("set_token_allowed")
            .args_json(json!({ "token": ft.id(), "allowed": true }))
            .transact()
            .await?
            .into_result()?;
        // The contract must hold a token account to receive deposits.
        circles
            .as_account()
            .call(ft.id(), "storage_deposit")
            .args_json(json!({ "account_id": circles.id() }))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;

        Ok(Self {
            worker,
            circles,
            ft,
        })
    }

    async fn user(&self, name: &str, minted: u128) -> anyhow::Result<Account> {
        let account = self
            .worker
            .root_account()?
            .create_subaccount(name)
            .initial_balance(NearToken::from_near(10))
            .transact()
            .await?
            .into_result()?;
        if minted > 0 {
            self.mint(&account, minted).await?;
        }
        Ok(account)
    }

    async fn mint(&self, account: &Account, amount: u128) -> anyhow::Result<()> {
        self.ft
            .call("mint")
            .args_json(json!({ "account_id": account.id(), "amount": amount.to_string() }))
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn balance(&self, account: &Account) -> anyhow::Result<u128> {
        let b: String = self
            .ft
            .view("ft_balance_of")
            .args_json(json!({ "account_id": account.id() }))
            .await?
            .json()?;
        Ok(b.parse()?)
    }

    /// Creates, fills and starts a circle owned by `members[0]`, in that payout order.
    async fn started_circle(&self, members: &[&Account]) -> anyhow::Result<u64> {
        let owner = members[0];
        let id: String = owner
            .call(self.circles.id(), "create")
            .args_json(json!({ "args": {
                "token": self.ft.id(),
                "deposit_amount": DEPOSIT.to_string(),
                "deposit_interval": INTERVAL.to_string(),
            }}))
            .deposit(STORAGE)
            .transact()
            .await?
            .into_result()?
            .json()?;
        let id: u64 = id.parse()?;

        let others: Vec<_> = members[1..].iter().map(|m| m.id()).collect();
        owner
            .call(self.circles.id(), "add_members")
            .args_json(json!({ "circle_id": id.to_string(), "members": others }))
            .deposit(STORAGE)
            .transact()
            .await?
            .into_result()?;
        owner
            .call(self.circles.id(), "start")
            .args_json(json!({ "circle_id": id.to_string() }))
            .deposit(STORAGE)
            .transact()
            .await?
            .into_result()?;
        Ok(id)
    }

    async fn deposit_for(
        &self,
        payer: &Account,
        id: u64,
        member: Option<&Account>,
        amount: u128,
    ) -> anyhow::Result<ExecutionFinalResult> {
        let mut msg = json!({ "circle_id": id.to_string() });
        if let Some(m) = member {
            msg["member"] = json!(m.id());
        }
        Ok(payer
            .call(self.ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": self.circles.id(),
                "amount": amount.to_string(),
                "msg": msg.to_string(),
            }))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?)
    }

    async fn deposit(&self, member: &Account, id: u64) -> anyhow::Result<()> {
        let outcome = self.deposit_for(member, id, None, DEPOSIT).await?;
        let used: String = outcome.clone().into_result()?.json()?;
        anyhow::ensure!(used == DEPOSIT.to_string(), "deposit refunded: {outcome:?}");
        Ok(())
    }

    async fn withdraw(&self, member: &Account, id: u64) -> anyhow::Result<ExecutionFinalResult> {
        Ok(member
            .call(self.circles.id(), "withdraw")
            .args_json(json!({ "circle_id": id.to_string() }))
            .max_gas()
            .transact()
            .await?)
    }

    async fn view(&self, method: &str, args: Value) -> anyhow::Result<Value> {
        Ok(self.circles.view(method).args_json(args).await?.json()?)
    }

    async fn circle(&self, id: u64) -> anyhow::Result<Value> {
        self.view("get_circle", json!({ "circle_id": id.to_string() }))
            .await
    }

    /// Moves the sandbox clock to `offset` nanoseconds after the circle started.
    async fn advance_to(&self, id: u64, offset: u64) -> anyhow::Result<()> {
        let start: u64 = self.circle(id).await?["start_time"]
            .as_str()
            .unwrap()
            .parse()?;
        let target = start + offset;
        loop {
            let now = self.worker.view_block().await?.timestamp();
            if now >= target {
                return Ok(());
            }
            // Sandbox blocks are about a second apart; overshoot slightly rather than loop.
            let blocks = (target - now) / 1_000_000_000 + 2;
            self.worker.fast_forward(blocks).await?;
        }
    }
}

fn events(outcome: &ExecutionFinalResult, event: &str) -> Vec<Value> {
    outcome
        .logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|e| e["standard"] == "saving_circles" && e["event"] == event)
        .collect()
}

#[tokio::test]
async fn full_circle_pays_every_member_once() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", 3 * DEPOSIT).await?;
    let bob = env.user("bob", 3 * DEPOSIT).await?;
    let carol = env.user("carol", 3 * DEPOSIT).await?;
    let members = [&alice, &bob, &carol];
    let id = env.started_circle(&members).await?;

    for (round, recipient) in members.iter().enumerate() {
        env.advance_to(id, round as u64 * INTERVAL + 1).await?;
        for m in members {
            env.deposit(m, id).await?;
        }
        let before = env.balance(recipient).await?;
        let outcome = env.withdraw(recipient, id).await?;
        assert!(outcome.is_success(), "{outcome:?}");
        assert_eq!(events(&outcome, "funds_withdrawn").len(), 1);
        assert_eq!(env.balance(recipient).await? - before, 3 * DEPOSIT);
    }

    for m in members {
        assert_eq!(env.balance(m).await?, 3 * DEPOSIT);
    }
    let circle = env.circle(id).await?;
    assert_eq!(circle["active"], false);
    assert_eq!(env.balance(env.circles.as_account()).await?, 0);

    // A finished circle can't be restarted.
    let restart = alice
        .call(env.circles.id(), "start")
        .args_json(json!({ "circle_id": id.to_string() }))
        .deposit(STORAGE)
        .transact()
        .await?;
    assert!(format!("{:?}", restart.into_result()).contains("AlreadyActive"));
    Ok(())
}

#[tokio::test]
async fn rejected_deposits_are_returned_by_the_token() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", 5 * DEPOSIT).await?;
    let bob = env.user("bob", 0).await?;
    let mallory = env.user("mallory", 5 * DEPOSIT).await?;
    let id = env.started_circle(&[&alice, &bob]).await?;

    for (payer, amount) in [(&alice, DEPOSIT + 1), (&mallory, DEPOSIT)] {
        let outcome = env.deposit_for(payer, id, None, amount).await?;
        let used: String = outcome.into_result()?.json()?;
        assert_eq!(used, "0");
        assert_eq!(env.balance(payer).await?, 5 * DEPOSIT);
    }
    assert_eq!(env.balance(env.circles.as_account()).await?, 0);

    let bad_msg = alice
        .call(env.ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": env.circles.id(),
            "amount": DEPOSIT.to_string(),
            "msg": "not json",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    let used: String = bad_msg.into_result()?.json()?;
    assert_eq!(used, "0");
    assert_eq!(env.balance(&alice).await?, 5 * DEPOSIT);
    Ok(())
}

#[tokio::test]
async fn failed_payout_is_restored_and_can_be_retried() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", 4 * DEPOSIT).await?;
    // Never registered with the token, so a payout to dave fails.
    let dave = env.user("dave", 0).await?;
    let id = env.started_circle(&[&dave, &alice]).await?;

    env.deposit(&alice, id).await?;
    let paid_for_dave = env.deposit_for(&alice, id, Some(&dave), DEPOSIT).await?;
    assert_eq!(
        paid_for_dave.into_result()?.json::<String>()?,
        DEPOSIT.to_string()
    );

    let failed = env.withdraw(&dave, id).await?;
    assert_eq!(events(&failed, "payout_failed").len(), 1);
    assert!(events(&failed, "funds_withdrawn").is_empty());
    let member = env
        .view(
            "get_member",
            json!({ "circle_id": id.to_string(), "member": dave.id() }),
        )
        .await?;
    assert_eq!(member["has_claimed"], false);
    assert_eq!(env.balance(env.circles.as_account()).await?, 2 * DEPOSIT);

    dave.call(env.ft.id(), "storage_deposit")
        .args_json(json!({}))
        .deposit(NearToken::from_millinear(10))
        .transact()
        .await?
        .into_result()?;
    let retried = env.withdraw(&dave, id).await?;
    assert_eq!(events(&retried, "funds_withdrawn").len(), 1);
    assert_eq!(env.balance(&dave).await?, 2 * DEPOSIT);
    Ok(())
}

#[tokio::test]
async fn stalled_circle_is_decommissioned_and_refunded() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", DEPOSIT).await?;
    let bob = env.user("bob", DEPOSIT).await?;
    let carol = env.user("carol", DEPOSIT).await?;
    let id = env.started_circle(&[&alice, &bob, &carol]).await?;

    env.deposit(&alice, id).await?;
    env.deposit(&bob, id).await?;
    let early = bob
        .call(env.circles.id(), "decommission")
        .args_json(json!({ "circle_id": id.to_string() }))
        .transact()
        .await?;
    assert!(format!("{:?}", early.into_result()).contains("NotDecommissionable"));

    env.advance_to(id, INTERVAL + 1).await?;
    assert_eq!(
        env.view(
            "is_decommissionable",
            json!({ "circle_id": id.to_string() })
        )
        .await?,
        true
    );
    bob.call(env.circles.id(), "decommission")
        .args_json(json!({ "circle_id": id.to_string() }))
        .transact()
        .await?
        .into_result()?;

    // Anyone can push refunds out; carol deposited nothing, so has none.
    for m in [&alice, &bob] {
        let outcome = carol
            .call(env.circles.id(), "claim_refund")
            .args_json(json!({ "circle_id": id.to_string(), "member": m.id() }))
            .max_gas()
            .transact()
            .await?;
        assert_eq!(events(&outcome, "refund_sent").len(), 1, "{outcome:?}");
        assert_eq!(env.balance(m).await?, DEPOSIT);
    }
    let none = carol
        .call(env.circles.id(), "claim_refund")
        .args_json(json!({ "circle_id": id.to_string(), "member": carol.id() }))
        .max_gas()
        .transact()
        .await?;
    assert!(format!("{:?}", none.into_result()).contains("NothingToRefund"));
    assert_eq!(env.balance(env.circles.as_account()).await?, 0);
    Ok(())
}

#[tokio::test]
async fn storage_must_be_paid_and_excess_is_refunded() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", 0).await?;
    let create = |deposit| {
        alice
            .call(env.circles.id(), "create")
            .args_json(json!({ "args": {
                "token": env.ft.id(),
                "deposit_amount": DEPOSIT.to_string(),
                "deposit_interval": INTERVAL.to_string(),
            }}))
            .deposit(deposit)
            .transact()
    };

    let unpaid = create(NearToken::from_yoctonear(0)).await?;
    assert!(format!("{:?}", unpaid.into_result()).contains("for storage"));

    let before = alice.view_account().await?.balance;
    create(NearToken::from_near(5)).await?.into_result()?;
    let spent = before.saturating_sub(alice.view_account().await?.balance);
    // Storage for one circle plus gas is well under 0.1 NEAR; the rest came back.
    assert!(spent < NearToken::from_millinear(100), "spent {spent}");
    Ok(())
}

#[tokio::test]
async fn keeper_processes_prefunded_deposits_and_claims() -> anyhow::Result<()> {
    let env = Env::new().await?;
    let alice = env.user("alice", 2 * DEPOSIT).await?;
    let bob = env.user("bob", 2 * DEPOSIT).await?;
    let carol = env.user("carol", 2 * DEPOSIT).await?;
    let keeper = env.user("keeper", 0).await?;
    let members = [&alice, &bob, &carol];
    let id = env.started_circle(&members).await?;

    let prefund = |m: &Account, amount: u128| {
        m.call(env.ft.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": env.circles.id(),
                "amount": amount.to_string(),
                "msg": json!({ "circle_id": id.to_string(), "prefund": true }).to_string(),
            }))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
    };
    let process_due = || {
        keeper
            .call(env.circles.id(), "process_due")
            .args_json(json!({ "circle_id": id.to_string() }))
            .max_gas()
            .transact()
    };

    // Pre-funding needs automation settings first; the token returns the transfer.
    let early: String = prefund(&alice, DEPOSIT).await?.into_result()?.json()?;
    assert_eq!(early, "0");

    for m in members {
        m.call(env.circles.id(), "set_automation")
            .args_json(json!({ "circle_id": id.to_string(), "deposits": true, "claims": true }))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await?
            .into_result()?;
    }
    // Carol pre-funds only half a deposit.
    for (m, amount) in [
        (&alice, 2 * DEPOSIT),
        (&bob, 2 * DEPOSIT),
        (&carol, DEPOSIT / 2),
    ] {
        let used: String = prefund(m, amount).await?.into_result()?.json()?;
        assert_eq!(used, amount.to_string());
    }

    let first = process_due().await?;
    assert!(first.is_success(), "{first:?}");
    assert_eq!(events(&first, "funds_deposited").len(), 2);
    let failed = events(&first, "automated_deposit_failed");
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0]["data"]["member"], carol.id().to_string());

    let used: String = prefund(&carol, DEPOSIT * 3 / 2)
        .await?
        .into_result()?
        .json()?;
    assert_eq!(used, (DEPOSIT * 3 / 2).to_string());
    let retry = process_due().await?;
    assert_eq!(events(&retry, "funds_deposited").len(), 1);

    // Next round: everyone's deposit comes from their balance and alice is paid round 0.
    env.advance_to(id, INTERVAL + 1).await?;
    let second = process_due().await?;
    assert!(second.is_success(), "{second:?}");
    assert_eq!(events(&second, "funds_deposited").len(), 3);
    assert_eq!(events(&second, "funds_withdrawn").len(), 1);
    assert_eq!(env.balance(&alice).await?, 3 * DEPOSIT);

    // Both pre-funded deposits are spent, so there is nothing left to withdraw.
    let empty = bob
        .call(env.circles.id(), "withdraw_prefund")
        .args_json(json!({ "circle_id": id.to_string() }))
        .max_gas()
        .transact()
        .await?;
    assert!(format!("{:?}", empty.into_result()).contains("NothingToWithdraw"));
    // Pot of round 1 is held, nothing else.
    assert_eq!(env.balance(env.circles.as_account()).await?, 3 * DEPOSIT);
    Ok(())
}
