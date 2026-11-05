#![allow(unused_must_use)]

use super::*;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const SEC: u64 = 1_000_000_000;
const INTERVAL: u64 = 7 * 24 * 3600 * SEC;
const T0: u64 = 1_800_000_000 * SEC;
const AMOUNT: u128 = 10_000_000;
const ID: U64 = U64(0);

fn contract_id() -> AccountId {
    "circles.testnet".parse().unwrap()
}

fn admin() -> AccountId {
    "admin.testnet".parse().unwrap()
}

fn token() -> AccountId {
    "usdc.testnet".parse().unwrap()
}

fn context(caller: &AccountId, now: u64, deposit: NearToken) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(contract_id())
        .predecessor_account_id(caller.clone())
        .block_timestamp(now)
        .attached_deposit(deposit);
    builder
}

fn call_as(caller: &AccountId, now: u64) {
    testing_env!(context(caller, now, NearToken::from_near(1)).build());
}

fn round_time(round: u64) -> u64 {
    T0 + round * INTERVAL + 1
}

fn deploy() -> SavingCircles {
    call_as(&admin(), T0);
    let mut c = SavingCircles::new(admin());
    c.set_token_allowed(token(), true);
    c
}

fn create(c: &mut SavingCircles, members: &[AccountId]) {
    call_as(&members[0], T0);
    let id = c.create(CreateCircleArgs {
        owner: None,
        token: token(),
        deposit_amount: U128(AMOUNT),
        deposit_interval: U64(INTERVAL),
    });
    assert_eq!(id, ID);
    if members.len() > 1 {
        c.add_members(ID, members[1..].to_vec());
    }
}

/// A started circle with `n` members: alice, bob, charlie, …
fn started(n: usize) -> (SavingCircles, Vec<AccountId>) {
    let mut c = deploy();
    let members: Vec<AccountId> = (0..n).map(accounts).collect();
    create(&mut c, &members);
    c.start(ID);
    (c, members)
}

fn deposit_from(
    c: &mut SavingCircles,
    token_id: &AccountId,
    from: &AccountId,
    now: u64,
    amount: u128,
) {
    testing_env!(context(token_id, now, NearToken::from_yoctonear(0)).build());
    c.ft_on_transfer(
        from.clone(),
        U128(amount),
        r#"{"circle_id":"0"}"#.to_string(),
    );
}

fn deposit(c: &mut SavingCircles, from: &AccountId, now: u64, amount: u128) {
    deposit_from(c, &token(), from, now, amount);
}

fn everyone_deposits(c: &mut SavingCircles, members: &[AccountId], round: u64) {
    for m in members {
        deposit(c, m, round_time(round), AMOUNT);
    }
}

fn has_claimed(c: &SavingCircles, member: &AccountId) -> bool {
    c.get_member(ID, member.clone()).unwrap().has_claimed
}

#[test]
fn full_cycle_pays_every_member_once() {
    let (mut c, members) = started(3);
    assert_eq!(c.circle_state(ID), CircleState::Active);

    for (round, member) in members.iter().enumerate() {
        let round = round as u64;
        everyone_deposits(&mut c, &members, round);
        call_as(member, round_time(round));
        assert_eq!(c.round_state(ID), RoundState::Claimable);
        assert_eq!(c.current_round_withdrawer(ID), Some(member.clone()));
        c.withdraw(ID);
        assert!(has_claimed(&c, member));
    }

    assert!(!c.is_active(ID));
    assert!(members.iter().all(|m| has_claimed(&c, m)));
}

#[test]
fn partial_deposits_add_up_to_the_round_amount() {
    let (mut c, members) = started(2);
    deposit(&mut c, &members[1], round_time(0), AMOUNT / 2);
    deposit(&mut c, &members[1], round_time(0), AMOUNT / 2);
    call_as(&members[0], round_time(0));
    let balances = c.get_member_balances(ID);
    assert_eq!(balances[1].balance, U128(AMOUNT));
}

#[test]
#[should_panic(expected = "ExceedsDepositAmount")]
fn deposit_over_round_amount_fails() {
    let (mut c, members) = started(2);
    deposit(&mut c, &members[1], round_time(0), AMOUNT);
    deposit(&mut c, &members[1], round_time(0), 1);
}

#[test]
#[should_panic(expected = "TokenNotAllowed")]
fn deposit_in_another_token_fails() {
    let (mut c, members) = started(2);
    deposit_from(
        &mut c,
        &"fake.testnet".parse().unwrap(),
        &members[1],
        round_time(0),
        AMOUNT,
    );
}

#[test]
#[should_panic(expected = "NotActive")]
fn deposit_before_start_fails() {
    let mut c = deploy();
    let members = vec![accounts(0), accounts(1)];
    create(&mut c, &members);
    deposit(&mut c, &members[1], round_time(0), AMOUNT);
}

#[test]
#[should_panic(expected = "NotMember")]
fn deposit_by_non_member_fails() {
    let (mut c, _) = started(2);
    deposit(&mut c, &accounts(5), round_time(0), AMOUNT);
}

#[test]
fn deposit_for_another_member() {
    let (mut c, members) = started(2);
    testing_env!(context(&token(), round_time(0), NearToken::from_yoctonear(0)).build());
    let msg = format!(r#"{{"circle_id":"0","member":"{}"}}"#, members[1]);
    c.ft_on_transfer(accounts(5), U128(AMOUNT), msg);
    assert_eq!(
        c.get_member(ID, members[1].clone()).unwrap().deposits[0],
        U128(AMOUNT)
    );
}

#[test]
#[should_panic(expected = "NotWithdrawable")]
fn withdraw_before_everyone_deposited_fails() {
    let (mut c, members) = started(3);
    deposit(&mut c, &members[0], round_time(0), AMOUNT);
    call_as(&members[0], round_time(0));
    c.withdraw(ID);
}

#[test]
#[should_panic(expected = "NotWithdrawable")]
fn withdraw_out_of_turn_fails() {
    let (mut c, members) = started(3);
    everyone_deposits(&mut c, &members, 0);
    call_as(&members[1], round_time(0));
    c.withdraw(ID);
}

#[test]
fn anyone_can_trigger_a_due_payout() {
    let (mut c, members) = started(2);
    everyone_deposits(&mut c, &members, 0);
    call_as(&accounts(5), round_time(0));
    c.withdraw_for(ID, members[0].clone());
    assert!(has_claimed(&c, &members[0]));
}

#[test]
fn failed_payout_restores_the_claim() {
    let (mut c, members) = started(2);
    everyone_deposits(&mut c, &members, 0);
    call_as(&members[0], round_time(0));
    c.withdraw(ID);

    testing_env!(
        context(&contract_id(), round_time(0), NearToken::from_yoctonear(0)).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    c.on_payout(ID, members[0].clone(), U128(AMOUNT * 2));

    assert!(!has_claimed(&c, &members[0]));
    assert!(c.is_member_withdrawable(ID, members[0].clone()));
}

#[test]
fn missed_deposit_allows_decommission_and_refunds_unpaid_rounds() {
    let (mut c, members) = started(3);
    everyone_deposits(&mut c, &members, 0);
    call_as(&members[0], round_time(0));
    c.withdraw(ID);

    // Round 1: alice never pays.
    deposit(&mut c, &members[1], round_time(1), AMOUNT);
    deposit(&mut c, &members[2], round_time(1), AMOUNT);

    call_as(&members[2], round_time(2));
    assert_eq!(c.circle_state(ID), CircleState::MissedDeposit);
    assert!(c.is_decommissionable(ID));
    assert!(!c.is_withdrawable(ID));
    c.decommission(ID);

    assert_eq!(c.circle_state(ID), CircleState::Decommissioned);
    let owed = |m: &AccountId| c.get_member(ID, m.clone()).unwrap().refund_owed.0;
    assert_eq!(owed(&members[0]), 0);
    assert_eq!(owed(&members[1]), AMOUNT);
    assert_eq!(owed(&members[2]), AMOUNT);

    c.claim_refund(ID, members[1].clone());
    assert_eq!(
        c.get_member(ID, members[1].clone()).unwrap().refund_owed,
        U128(0)
    );
}

#[test]
#[should_panic(expected = "CircleTimedOut")]
fn deposit_after_a_missed_round_fails() {
    let (mut c, members) = started(3);
    everyone_deposits(&mut c, &members, 0);
    deposit(&mut c, &members[1], round_time(1), AMOUNT);
    deposit(&mut c, &members[1], round_time(2), AMOUNT);
}

#[test]
#[should_panic(expected = "NotDecommissionable")]
fn decommission_while_on_schedule_fails() {
    let (mut c, members) = started(2);
    everyone_deposits(&mut c, &members, 0);
    call_as(&members[0], round_time(1));
    c.decommission(ID);
}

#[test]
#[should_panic(expected = "CircleExpired")]
fn deposit_after_last_round_fails() {
    let (mut c, members) = started(2);
    deposit(&mut c, &members[0], round_time(2), AMOUNT);
}

#[test]
fn removing_a_member_keeps_payout_order() {
    let mut c = deploy();
    let members: Vec<AccountId> = (0..4).map(accounts).collect();
    create(&mut c, &members);

    call_as(&members[2], T0);
    c.remove_member(ID, members[2].clone());

    assert_eq!(
        c.get_circle_members(ID),
        vec![members[0].clone(), members[1].clone(), members[3].clone()]
    );
    assert!(c.get_member_circles(members[2].clone()).is_empty());
}

#[test]
#[should_panic(expected = "InvalidMemberAddress")]
fn owner_cannot_be_removed() {
    let mut c = deploy();
    let members = vec![accounts(0), accounts(1)];
    create(&mut c, &members);
    c.remove_member(ID, members[0].clone());
}

#[test]
#[should_panic(expected = "AlreadyMember")]
fn duplicate_members_fail() {
    let mut c = deploy();
    create(&mut c, &[accounts(0), accounts(1)]);
    c.add_members(ID, vec![accounts(2), accounts(2)]);
}

#[test]
#[should_panic(expected = "InvalidMemberCount")]
fn more_than_max_members_fails() {
    let mut c = deploy();
    create(&mut c, &[accounts(0)]);
    let extra: Vec<AccountId> = (0..MAX_MEMBERS)
        .map(|i| format!("member{i}.testnet").parse().unwrap())
        .collect();
    c.add_members(ID, extra);
}

#[test]
#[should_panic(expected = "NotOwner")]
fn only_owner_can_start() {
    let mut c = deploy();
    create(&mut c, &[accounts(0), accounts(1)]);
    call_as(&accounts(1), T0);
    c.start(ID);
}

#[test]
#[should_panic(expected = "InvalidMemberCount")]
fn start_needs_two_members() {
    let mut c = deploy();
    create(&mut c, &[accounts(0)]);
    c.start(ID);
}

#[test]
#[should_panic(expected = "AlreadyActive")]
fn finished_circle_cannot_restart() {
    let (mut c, members) = started(2);
    for (round, member) in members.iter().enumerate() {
        everyone_deposits(&mut c, &members, round as u64);
        call_as(member, round_time(round as u64));
        c.withdraw(ID);
    }
    call_as(&members[0], round_time(2));
    c.start(ID);
}

#[test]
#[should_panic(expected = "TokenNotAllowed")]
fn create_with_unlisted_token_fails() {
    let mut c = deploy();
    call_as(&accounts(0), T0);
    c.create(CreateCircleArgs {
        owner: None,
        token: "fake.testnet".parse().unwrap(),
        deposit_amount: U128(AMOUNT),
        deposit_interval: U64(INTERVAL),
    });
}

#[test]
#[should_panic(expected = "for storage")]
fn create_without_storage_deposit_fails() {
    let mut c = deploy();
    testing_env!(context(&accounts(0), T0, NearToken::from_yoctonear(0)).build());
    c.create(CreateCircleArgs {
        owner: None,
        token: token(),
        deposit_amount: U128(AMOUNT),
        deposit_interval: U64(INTERVAL),
    });
}

#[test]
#[should_panic(expected = "NotOwner")]
fn only_contract_owner_allows_tokens() {
    let mut c = deploy();
    call_as(&accounts(0), T0);
    c.set_token_allowed("other.testnet".parse().unwrap(), true);
}
