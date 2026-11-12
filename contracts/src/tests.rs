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

// ------------------------------------------------------------ automation

fn automate(c: &mut SavingCircles, member: &AccountId, deposits: bool, claims: bool) {
    call_as(member, T0);
    c.set_automation(ID, deposits, claims);
}

fn prefund(c: &mut SavingCircles, member: &AccountId, now: u64, amount: u128) {
    testing_env!(context(&token(), now, NearToken::from_yoctonear(0)).build());
    c.ft_on_transfer(
        member.clone(),
        U128(amount),
        r#"{"circle_id":"0","prefund":true}"#.to_string(),
    );
}

fn prefunded(c: &SavingCircles, member: &AccountId) -> u128 {
    c.get_automation(ID, member.clone()).unwrap().balance.0
}

fn deposited(c: &SavingCircles, member: &AccountId, round: usize) -> u128 {
    c.get_member(ID, member.clone()).unwrap().deposits[round].0
}

fn process_due(c: &mut SavingCircles, now: u64) -> Due {
    call_as(&accounts(5), now);
    c.process_due(ID)
}

/// A started circle where every member automates deposits and claims and pre-funds
/// `rounds` deposits.
fn automated(n: usize, rounds: u128) -> (SavingCircles, Vec<AccountId>) {
    let (mut c, members) = started(n);
    for m in &members {
        automate(&mut c, m, true, true);
        prefund(&mut c, m, T0, rounds * AMOUNT);
    }
    (c, members)
}

#[test]
fn process_due_runs_a_whole_circle() {
    let (mut c, members) = automated(3, 3);

    for round in 0..3u64 {
        let due = process_due(&mut c, round_time(round));
        assert_eq!(due.deposits, members);
        assert!(due.underfunded.is_empty());
        // The previous round's recipient is paid once their round has ended.
        let expected: Vec<AccountId> = match round {
            0 => vec![],
            r => vec![members[r as usize - 1].clone()],
        };
        assert_eq!(due.claims, expected);
    }
    let last = process_due(&mut c, round_time(3));
    assert!(last.deposits.is_empty());
    assert_eq!(last.claims, vec![members[2].clone()]);

    assert!(members.iter().all(|m| has_claimed(&c, m)));
    assert!(members.iter().all(|m| prefunded(&c, m) == 0));
    assert!(!c.is_active(ID));
}

#[test]
fn underfunded_member_is_skipped_and_the_rest_still_deposit() {
    let (mut c, members) = started(3);
    for m in &members {
        automate(&mut c, m, true, true);
    }
    prefund(&mut c, &members[0], T0, AMOUNT);
    prefund(&mut c, &members[1], T0, AMOUNT);
    prefund(&mut c, &members[2], T0, AMOUNT / 2);

    call_as(&accounts(5), round_time(0));
    let preview = c.get_due(ID);
    let due = process_due(&mut c, round_time(0));
    assert_eq!(preview, due);
    assert_eq!(due.deposits, members[..2].to_vec());
    assert_eq!(due.underfunded, vec![members[2].clone()]);

    assert_eq!(deposited(&c, &members[0], 0), AMOUNT);
    assert_eq!(deposited(&c, &members[1], 0), AMOUNT);
    assert_eq!(deposited(&c, &members[2], 0), 0);
    assert_eq!(prefunded(&c, &members[2]), AMOUNT / 2);

    // Topping up within the round lets the next call catch up.
    prefund(&mut c, &members[2], round_time(0), AMOUNT / 2);
    let retry = process_due(&mut c, round_time(0));
    assert_eq!(retry.deposits, vec![members[2].clone()]);
    assert!(retry.underfunded.is_empty());
    call_as(&accounts(5), round_time(0));
    assert_eq!(c.round_state(ID), RoundState::Claimable);
}

#[test]
fn automatic_deposit_tops_up_a_partial_manual_deposit() {
    let (mut c, members) = started(2);
    automate(&mut c, &members[1], true, false);
    prefund(&mut c, &members[1], T0, AMOUNT);
    deposit(&mut c, &members[1], round_time(0), AMOUNT / 4);

    let due = process_due(&mut c, round_time(0));
    assert_eq!(due.deposits, vec![members[1].clone()]);
    assert_eq!(deposited(&c, &members[1], 0), AMOUNT);
    assert_eq!(prefunded(&c, &members[1]), AMOUNT / 4);
}

#[test]
fn opt_out_stops_automation_and_keeps_the_balance() {
    let (mut c, members) = automated(2, 1);
    automate(&mut c, &members[0], false, false);

    let due = process_due(&mut c, round_time(0));
    assert_eq!(due.deposits, vec![members[1].clone()]);
    assert_eq!(deposited(&c, &members[0], 0), 0);
    assert_eq!(prefunded(&c, &members[0]), AMOUNT);

    // Deposits made by hand still count, but the claim waits for a manual withdraw.
    deposit(&mut c, &members[0], round_time(0), AMOUNT);
    let due = process_due(&mut c, round_time(1));
    assert!(due.claims.is_empty());
    assert!(!has_claimed(&c, &members[0]));
}

#[test]
fn claims_wait_for_the_round_to_end() {
    let (mut c, members) = automated(2, 2);
    let due = process_due(&mut c, round_time(0));
    assert!(due.claims.is_empty());
    call_as(&accounts(5), round_time(0));
    assert_eq!(c.round_state(ID), RoundState::Claimable);
    assert!(!has_claimed(&c, &members[0]));
}

#[test]
fn nothing_is_due_once_a_round_is_missed() {
    let (mut c, members) = started(3);
    automate(&mut c, &members[0], true, true);
    prefund(&mut c, &members[0], T0, 3 * AMOUNT);
    process_due(&mut c, round_time(0));

    // Round 0 closed incomplete: the circle can only be decommissioned now.
    let due = process_due(&mut c, round_time(1));
    assert_eq!(due, Due::default());
    assert_eq!(prefunded(&c, &members[0]), 2 * AMOUNT);
}

#[test]
fn prefund_can_be_withdrawn_and_a_failed_transfer_restores_it() {
    let (mut c, members) = automated(2, 2);

    call_as(&members[0], round_time(0));
    c.withdraw_prefund(ID, Some(U128(AMOUNT)));
    assert_eq!(prefunded(&c, &members[0]), AMOUNT);

    testing_env!(
        context(&contract_id(), round_time(0), NearToken::from_yoctonear(0)).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed],
    );
    c.on_prefund_withdrawn(ID, members[0].clone(), U128(AMOUNT));
    assert_eq!(prefunded(&c, &members[0]), 2 * AMOUNT);

    call_as(&members[0], round_time(0));
    c.withdraw_prefund(ID, None);
    assert_eq!(prefunded(&c, &members[0]), 0);
}

#[test]
#[should_panic(expected = "InsufficientBalance")]
fn withdrawing_more_than_the_prefund_fails() {
    let (mut c, members) = automated(2, 1);
    call_as(&members[0], round_time(0));
    c.withdraw_prefund(ID, Some(U128(AMOUNT + 1)));
}

#[test]
#[should_panic(expected = "AutomationNotSet")]
fn prefund_without_automation_settings_fails() {
    let (mut c, members) = started(2);
    prefund(&mut c, &members[1], T0, AMOUNT);
}

#[test]
#[should_panic(expected = "NotMember")]
fn non_member_cannot_set_automation() {
    let (mut c, _) = started(2);
    automate(&mut c, &accounts(5), true, true);
}

#[test]
fn members_can_automate_and_prefund_before_the_start() {
    let mut c = deploy();
    let members = vec![accounts(0), accounts(1)];
    create(&mut c, &members);
    automate(&mut c, &members[1], true, false);
    prefund(&mut c, &members[1], T0, AMOUNT);
    assert_eq!(process_due(&mut c, T0), Due::default());

    call_as(&members[0], T0);
    c.start(ID);
    let due = process_due(&mut c, round_time(0));
    assert_eq!(due.deposits, vec![members[1].clone()]);
}

#[test]
fn migrate_upgrades_state_from_before_automation() {
    call_as(&admin(), T0);
    env::state_write(&SavingCirclesV1 {
        owner_id: admin(),
        next_id: 7,
        circles: LookupMap::new(StorageKey::Circles),
        allowed_tokens: IterableSet::new(StorageKey::AllowedTokens),
        member_circles: LookupMap::new(StorageKey::MemberCircles),
    });

    let c = SavingCircles::migrate();
    assert_eq!(c.next_id(), U64(7));
    assert_eq!(c.owner_id(), admin());

    // Running it again on current state returns it unchanged.
    env::state_write(&c);
    assert_eq!(SavingCircles::migrate().next_id(), U64(7));
}
