//! Rotating savings circles (ROSCAs) for NEP-141 tokens.
//!
//! Ported from `reference/evm/src/contracts/SavingCircles.sol`, with the automation of
//! `AutomaticSavingCircles.sol` built in (see `process_due`). Panic messages use the
//! Solidity error names so both implementations can be read side by side.

use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

#[cfg(test)]
mod tests;

pub const MINIMUM_MEMBERS: usize = 2;
/// Keeps every per-circle loop, and the deposit matrix allocated at `start`, small.
pub const MAX_MEMBERS: usize = 25;

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Circles,
    AllowedTokens,
    MemberCircles,
    Automation,
}

/// A member's automation settings for one circle, keyed by `(circle id, member)`.
#[near(serializers = [borsh])]
pub struct Automation {
    deposits: bool,
    claims: bool,
    /// Pre-funded tokens that `process_due` draws deposits from.
    balance: u128,
}

#[near(serializers = [borsh])]
pub struct Member {
    account_id: AccountId,
    has_claimed: bool,
    last_deposit_round: u64,
    /// Amount deposited per round, indexed by round. Allocated at `start` so deposits
    /// never change storage size.
    deposits: Vec<u128>,
    /// Owed after decommissioning; paid out by `claim_refund`.
    refund_owed: u128,
}

impl Member {
    fn new(account_id: AccountId) -> Self {
        Self {
            account_id,
            has_claimed: false,
            last_deposit_round: 0,
            deposits: Vec::new(),
            refund_owed: 0,
        }
    }

    fn deposited(&self, round: u64) -> u128 {
        usize::try_from(round)
            .ok()
            .and_then(|r| self.deposits.get(r))
            .copied()
            .unwrap_or(0)
    }
}

#[near(serializers = [borsh])]
pub struct Circle {
    owner: AccountId,
    token: AccountId,
    deposit_amount: u128,
    /// Nanoseconds.
    deposit_interval: u64,
    /// Nanoseconds. `None` until the owner starts the circle.
    start_time: Option<u64>,
    active: bool,
    decommissioned: bool,
    /// Payout order: the member at index `i` claims the pot of round `i`.
    members: Vec<Member>,
}

impl Circle {
    fn current_round(&self, now: u64) -> u64 {
        match self.start_time {
            Some(start) if self.deposit_interval > 0 && now >= start => {
                (now - start) / self.deposit_interval
            }
            _ => 0,
        }
    }

    fn round_end(&self, round: u64) -> u64 {
        self.start_time.unwrap_or(0).saturating_add(
            self.deposit_interval
                .saturating_mul(round.saturating_add(1)),
        )
    }

    fn end_time(&self) -> Option<u64> {
        self.start_time
            .map(|_| self.round_end(self.members.len() as u64 - 1))
    }

    fn all_deposited(&self, round: u64) -> bool {
        self.members
            .iter()
            .all(|m| m.deposited(round) >= self.deposit_amount)
    }

    fn all_claimed(&self) -> bool {
        self.members.iter().all(|m| m.has_claimed)
    }

    fn index_of(&self, account_id: &AccountId) -> Option<usize> {
        self.members
            .iter()
            .position(|m| &m.account_id == account_id)
    }

    fn is_member(&self, account_id: &AccountId) -> bool {
        self.index_of(account_id).is_some()
    }

    fn payout_amount(&self) -> u128 {
        self.deposit_amount * self.members.len() as u128
    }

    /// The previous round's window has closed with deposits missing.
    fn is_decommissionable(&self, now: u64) -> bool {
        if self.decommissioned || !self.active || self.members.is_empty() {
            return false;
        }
        let current = self.current_round(now);
        if current == 0 {
            return false;
        }
        let check = (current - 1).min(self.members.len() as u64 - 1);
        now >= self.round_end(check) && !self.all_deposited(check)
    }

    /// The round open for deposits, or the error a deposit would fail with.
    fn open_round(&self, now: u64) -> Result<u64, &'static str> {
        if !self.active {
            return Err("NotActive");
        }
        if self.decommissioned {
            return Err("NotCommissioned");
        }
        let round = self.current_round(now);
        if round >= self.members.len() as u64 {
            return Err("CircleExpired");
        }
        if round > 0 && now >= self.round_end(round - 1) && !self.all_deposited(round - 1) {
            return Err("CircleTimedOut");
        }
        Ok(round)
    }

    /// Adds to a member's deposit for `round`, which `open_round` returned.
    fn record_deposit(&mut self, index: usize, round: u64, amount: u128) {
        let deposit_amount = self.deposit_amount;
        let m = &mut self.members[index];
        let total = m.deposits[round as usize] + amount;
        require!(total <= deposit_amount, "ExceedsDepositAmount");
        m.deposits[round as usize] = total;
        m.last_deposit_round = round;
    }

    fn active_claimable(&self, index: usize, now: u64) -> bool {
        !self.members[index].has_claimed
            && self.current_round(now) >= index as u64
            && self.all_deposited(index as u64)
    }

    fn claimable(&self, index: usize, now: u64) -> bool {
        !self.is_decommissionable(now) && self.active_claimable(index, now)
    }

    fn state(&self, now: u64) -> CircleState {
        if self.decommissioned {
            return CircleState::Decommissioned;
        }
        if !self.active {
            return CircleState::NotStarted;
        }
        let current = self.current_round(now);
        if current >= self.members.len() as u64 {
            CircleState::Expired
        } else if current == 0 {
            CircleState::Active
        } else if now >= self.round_end(current - 1) && !self.all_deposited(current - 1) {
            CircleState::MissedDeposit
        } else if !self.all_deposited(current) {
            CircleState::DepositInProgress
        } else {
            CircleState::DepositComplete
        }
    }

    fn round_state(&self, now: u64) -> RoundState {
        if self.decommissioned || !self.active {
            return RoundState::NotStarted;
        }
        let current = self.current_round(now);
        if current >= self.members.len() as u64 {
            return RoundState::NotStarted;
        }
        if !self.all_deposited(current) {
            RoundState::DepositInProgress
        } else if self.claimable(current as usize, now) {
            RoundState::Claimable
        } else {
            RoundState::Claimed
        }
    }

    fn view(&self, id: u64, now: u64) -> CircleView {
        CircleView {
            id: U64(id),
            owner: self.owner.clone(),
            token: self.token.clone(),
            deposit_amount: U128(self.deposit_amount),
            deposit_interval: U64(self.deposit_interval),
            start_time: self.start_time.map(U64),
            end_time: self.end_time().map(U64),
            current_index: U64(self.current_round(now)),
            active: self.active,
            decommissioned: self.decommissioned,
            members: self.members.iter().map(|m| m.account_id.clone()).collect(),
        }
    }
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub enum CircleState {
    NotStarted,
    Active,
    DepositInProgress,
    DepositComplete,
    Expired,
    Decommissioned,
    MissedDeposit,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub enum RoundState {
    NotStarted,
    DepositInProgress,
    Claimable,
    Claimed,
}

#[near(serializers = [json])]
pub struct CreateCircleArgs {
    /// Defaults to the caller.
    pub owner: Option<AccountId>,
    pub token: AccountId,
    pub deposit_amount: U128,
    /// Nanoseconds.
    pub deposit_interval: U64,
}

#[near(serializers = [json])]
pub struct CircleView {
    pub id: U64,
    pub owner: AccountId,
    pub token: AccountId,
    pub deposit_amount: U128,
    pub deposit_interval: U64,
    pub start_time: Option<U64>,
    pub end_time: Option<U64>,
    pub current_index: U64,
    pub active: bool,
    pub decommissioned: bool,
    pub members: Vec<AccountId>,
}

#[near(serializers = [json])]
pub struct MemberView {
    pub account_id: AccountId,
    pub index: u32,
    pub has_claimed: bool,
    pub last_deposit_round: U64,
    pub deposits: Vec<U128>,
    pub refund_owed: U128,
}

#[near(serializers = [json])]
pub struct MemberBalance {
    pub account_id: AccountId,
    pub balance: U128,
}

/// `msg` of `ft_transfer_call` when depositing.
#[near(serializers = [json])]
pub struct DepositMsg {
    pub circle_id: U64,
    /// Deposit on behalf of another member. Defaults to the sender.
    pub member: Option<AccountId>,
    /// Add to the member's pre-funded balance for automatic deposits instead of
    /// depositing into the current round. The member must have called `set_automation`.
    pub prefund: Option<bool>,
}

#[near(serializers = [json])]
pub struct AutomationView {
    pub deposits: bool,
    pub claims: bool,
    pub balance: U128,
}

/// What `process_due` does, or would do now.
#[near(serializers = [json])]
#[derive(Debug, Default, PartialEq)]
pub struct Due {
    /// Members whose current-round deposit is made from their pre-funded balance.
    pub deposits: Vec<AccountId>,
    /// Members with automatic deposits on whose balance doesn't cover the deposit.
    pub underfunded: Vec<AccountId>,
    /// Members with automatic claims on who are paid out.
    pub claims: Vec<AccountId>,
}

#[near(event_json(standard = "saving_circles"))]
pub enum Event {
    #[event_version("1.0.0")]
    CircleCreated {
        id: U64,
        owner: AccountId,
        token: AccountId,
        deposit_amount: U128,
        deposit_interval: U64,
    },
    #[event_version("1.0.0")]
    CircleStarted { id: U64 },
    #[event_version("1.0.0")]
    CircleDecommissioned { id: U64 },
    #[event_version("1.0.0")]
    MemberAdded { id: U64, member: AccountId },
    #[event_version("1.0.0")]
    MemberRemoved { id: U64, member: AccountId },
    #[event_version("1.0.0")]
    FundsDeposited {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    FundsWithdrawn {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    PayoutFailed {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    RefundSent {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    TokenAllowed { token: AccountId, allowed: bool },
    #[event_version("1.0.0")]
    AutomationSet {
        id: U64,
        member: AccountId,
        deposits: bool,
        claims: bool,
    },
    #[event_version("1.0.0")]
    Prefunded {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    PrefundWithdrawn {
        id: U64,
        member: AccountId,
        amount: U128,
    },
    #[event_version("1.0.0")]
    AutomatedDepositFailed {
        id: U64,
        member: AccountId,
        needed: U128,
        balance: U128,
    },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SavingCircles {
    owner_id: AccountId,
    next_id: u64,
    circles: LookupMap<u64, Circle>,
    allowed_tokens: IterableSet<AccountId>,
    member_circles: LookupMap<AccountId, Vec<u64>>,
    automation: LookupMap<(u64, AccountId), Automation>,
}

/// State layout before automation, read by `migrate`.
#[near(serializers = [borsh])]
struct SavingCirclesV1 {
    owner_id: AccountId,
    next_id: u64,
    circles: LookupMap<u64, Circle>,
    allowed_tokens: IterableSet<AccountId>,
    member_circles: LookupMap<AccountId, Vec<u64>>,
}

#[near]
impl SavingCircles {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            next_id: 0,
            circles: LookupMap::new(StorageKey::Circles),
            allowed_tokens: IterableSet::new(StorageKey::AllowedTokens),
            member_circles: LookupMap::new(StorageKey::MemberCircles),
            automation: LookupMap::new(StorageKey::Automation),
        }
    }

    /// Call when redeploying over existing state. Upgrades state from before automation and
    /// returns current state unchanged, so it is safe on every redeploy.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let state = env::storage_read(b"STATE").unwrap_or_else(|| env::panic_str("NoState"));
        if let Ok(current) = near_sdk::borsh::from_slice::<Self>(&state) {
            return current;
        }
        let old: SavingCirclesV1 =
            near_sdk::borsh::from_slice(&state).unwrap_or_else(|_| env::panic_str("UnknownState"));
        Self {
            owner_id: old.owner_id,
            next_id: old.next_id,
            circles: old.circles,
            allowed_tokens: old.allowed_tokens,
            member_circles: old.member_circles,
            automation: LookupMap::new(StorageKey::Automation),
        }
    }

    // ---------------------------------------------------------------- admin

    /// The contract must also be registered with the token (`storage_deposit`) to hold it.
    pub fn set_token_allowed(&mut self, token: AccountId, allowed: bool) {
        self.assert_owner();
        if allowed {
            self.allowed_tokens.insert(token.clone());
        } else {
            self.allowed_tokens.remove(&token);
        }
        Event::TokenAllowed { token, allowed }.emit();
    }

    pub fn set_owner(&mut self, owner_id: AccountId) {
        self.assert_owner();
        self.owner_id = owner_id;
    }

    // ------------------------------------------------------------ lifecycle

    /// Attach NEAR for storage; the unused part is refunded.
    #[payable]
    pub fn create(&mut self, args: CreateCircleArgs) -> U64 {
        let initial_storage = env::storage_usage();
        let owner = args.owner.unwrap_or_else(env::predecessor_account_id);

        require!(self.allowed_tokens.contains(&args.token), "TokenNotAllowed");
        require!(args.deposit_interval.0 > 0, "InvalidDepositInterval");
        require!(
            args.deposit_amount.0 > 0
                && args
                    .deposit_amount
                    .0
                    .checked_mul(MAX_MEMBERS as u128)
                    .is_some(),
            "InvalidDepositAmount"
        );

        let id = self.next_id;
        self.next_id += 1;

        self.circles.insert(
            id,
            Circle {
                owner: owner.clone(),
                token: args.token.clone(),
                deposit_amount: args.deposit_amount.0,
                deposit_interval: args.deposit_interval.0,
                start_time: None,
                active: false,
                decommissioned: false,
                members: vec![Member::new(owner.clone())],
            },
        );
        self.add_member_circle(&owner, id);

        Event::CircleCreated {
            id: U64(id),
            owner,
            token: args.token,
            deposit_amount: args.deposit_amount,
            deposit_interval: args.deposit_interval,
        }
        .emit();

        self.charge_storage(initial_storage);
        U64(id)
    }

    /// Owner only, before the circle starts. Attach NEAR for storage.
    #[payable]
    pub fn add_members(&mut self, circle_id: U64, members: Vec<AccountId>) {
        let initial_storage = env::storage_usage();
        let id = circle_id.0;
        let caller = env::predecessor_account_id();
        let circle = self.commissioned_mut(id);

        require!(caller == circle.owner, "NotOwner");
        // `start_time` also rules out finished circles, which are no longer active.
        require!(
            !circle.active && circle.start_time.is_none(),
            "AlreadyActive"
        );
        require!(!members.is_empty(), "InvalidMemberCount");
        require!(
            circle.members.len() + members.len() <= MAX_MEMBERS,
            "InvalidMemberCount"
        );

        for member in &members {
            require!(!circle.is_member(member), "AlreadyMember");
            circle.members.push(Member::new(member.clone()));
        }
        for member in members {
            self.add_member_circle(&member, id);
            Event::MemberAdded {
                id: circle_id,
                member,
            }
            .emit();
        }

        self.charge_storage(initial_storage);
    }

    /// The owner can undo an add; a member can leave. Before the circle starts only.
    pub fn remove_member(&mut self, circle_id: U64, member: AccountId) {
        let id = circle_id.0;
        let caller = env::predecessor_account_id();
        let circle = self.commissioned_mut(id);

        require!(caller == circle.owner || caller == member, "NotOwner");
        require!(
            !circle.active && circle.start_time.is_none(),
            "AlreadyActive"
        );
        require!(member != circle.owner, "InvalidMemberAddress");
        let index = circle
            .index_of(&member)
            .unwrap_or_else(|| env::panic_str("NotMember"));

        circle.members.remove(index);
        self.remove_member_circle(&member, id);

        Event::MemberRemoved {
            id: circle_id,
            member,
        }
        .emit();
    }

    /// Owner only. Fixes the member list and payout order and opens round 0.
    /// Attach NEAR for the deposit matrix storage (members² × 16 bytes).
    #[payable]
    pub fn start(&mut self, circle_id: U64) {
        let initial_storage = env::storage_usage();
        let now = env::block_timestamp();
        let caller = env::predecessor_account_id();
        let circle = self.commissioned_mut(circle_id.0);

        // A finished circle is inactive but must not be restarted: every member has
        // already claimed, so new deposits could never be paid out.
        require!(
            !circle.active && circle.start_time.is_none(),
            "AlreadyActive"
        );
        require!(caller == circle.owner, "NotOwner");
        let count = circle.members.len();
        require!(count >= MINIMUM_MEMBERS, "InvalidMemberCount");
        require!(
            circle
                .deposit_interval
                .checked_mul(count as u64)
                .and_then(|d| now.checked_add(d))
                .is_some(),
            "InvalidDepositInterval"
        );

        circle.start_time = Some(now);
        circle.active = true;
        for member in circle.members.iter_mut() {
            member.deposits = vec![0; count];
        }

        Event::CircleStarted { id: circle_id }.emit();
        self.charge_storage(initial_storage);
    }

    /// Pays the caller the pot of the round matching their position.
    pub fn withdraw(&mut self, circle_id: U64) -> Promise {
        let caller = env::predecessor_account_id();
        let circle = self.circle(circle_id.0);
        require!(circle.is_member(&caller), "NotMember");
        self.internal_withdraw(circle_id.0, caller)
    }

    /// Anyone can trigger a payout that is due; funds always go to the member.
    pub fn withdraw_for(&mut self, circle_id: U64, member: AccountId) -> Promise {
        self.internal_withdraw(circle_id.0, member)
    }

    /// Any member can end a circle once a round closes with deposits missing. Deposits
    /// for rounds not yet paid out become refunds, collected with `claim_refund`.
    pub fn decommission(&mut self, circle_id: U64) {
        let now = env::block_timestamp();
        let caller = env::predecessor_account_id();
        let circle = self.circle_mut(circle_id.0);

        require!(circle.active, "NotActive");
        require!(circle.is_member(&caller), "NotMember");
        require!(circle.is_decommissionable(now), "NotDecommissionable");

        circle.active = false;
        circle.decommissioned = true;

        for round in 0..circle.members.len() {
            if circle.members[round].has_claimed {
                continue;
            }
            for member in circle.members.iter_mut() {
                member.refund_owed += member.deposits[round];
                member.deposits[round] = 0;
            }
        }

        Event::CircleDecommissioned { id: circle_id }.emit();
    }

    /// Pays out a member's refund after decommissioning. Anyone can call it, so a
    /// keeper or the frontend can refund every member.
    pub fn claim_refund(&mut self, circle_id: U64, member: AccountId) -> Promise {
        let circle = self.circle_mut(circle_id.0);
        let index = circle
            .index_of(&member)
            .unwrap_or_else(|| env::panic_str("NotMember"));
        let amount = circle.members[index].refund_owed;
        require!(amount > 0, "NothingToRefund");
        circle.members[index].refund_owed = 0;
        let token = circle.token.clone();

        ft_transfer(token, member.clone(), amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_refund(circle_id, member, U128(amount)),
        )
    }

    // ----------------------------------------------------------- automation

    /// Members only. Turns automatic deposits and claims on or off for the caller. The
    /// first call stores the member's settings: attach 0.01 NEAR, the unused part is
    /// refunded. Turning automation off keeps the pre-funded balance; `withdraw_prefund`
    /// returns it.
    #[payable]
    pub fn set_automation(&mut self, circle_id: U64, deposits: bool, claims: bool) {
        let initial_storage = env::storage_usage();
        let id = circle_id.0;
        let caller = env::predecessor_account_id();
        let circle = self.circle(id);
        require!(!circle.decommissioned, "NotCommissioned");
        require!(circle.is_member(&caller), "NotMember");

        let key = (id, caller.clone());
        match self.automation.get_mut(&key) {
            Some(settings) => {
                settings.deposits = deposits;
                settings.claims = claims;
            }
            None => {
                self.automation.insert(
                    key,
                    Automation {
                        deposits,
                        claims,
                        balance: 0,
                    },
                );
            }
        }

        Event::AutomationSet {
            id: circle_id,
            member: caller,
            deposits,
            claims,
        }
        .emit();
        self.charge_storage(initial_storage);
    }

    /// Returns the caller's pre-funded balance, all of it by default. Works in any circle
    /// state, including after decommissioning or removal from the circle.
    pub fn withdraw_prefund(&mut self, circle_id: U64, amount: Option<U128>) -> Promise {
        let member = env::predecessor_account_id();
        let token = self.circle(circle_id.0).token.clone();
        let settings = self
            .automation
            .get_mut(&(circle_id.0, member.clone()))
            .unwrap_or_else(|| env::panic_str("NothingToWithdraw"));
        let amount = amount.map_or(settings.balance, |a| a.0);
        require!(amount > 0, "NothingToWithdraw");
        require!(amount <= settings.balance, "InsufficientBalance");
        settings.balance -= amount;

        ft_transfer(token, member.clone(), amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_prefund_withdrawn(circle_id, member, U128(amount)),
        )
    }

    /// Anyone can call this, for example a keeper once per round. Makes the current round's
    /// deposit from the pre-funded balance of every member with automatic deposits on, then
    /// pays out every member with automatic claims on whose round has ended and is fully
    /// deposited. A member whose balance falls short is skipped with an
    /// `AutomatedDepositFailed` event and the others still go through. Attach about 25 TGas
    /// per payout on top of the base call.
    pub fn process_due(&mut self, circle_id: U64) -> Due {
        let id = circle_id.0;
        let now = env::block_timestamp();
        let due = self.due(id, now);

        let circle = self
            .circles
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("NotCommissioned"));
        // `due` lists deposits only for members of a circle with an open round.
        let round = circle.current_round(now);
        for member in &due.deposits {
            let index = circle.index_of(member).unwrap();
            let needed = circle.deposit_amount - circle.members[index].deposited(round);
            let settings = self.automation.get_mut(&(id, member.clone())).unwrap();
            settings.balance -= needed;
            circle.record_deposit(index, round, needed);
            Event::FundsDeposited {
                id: circle_id,
                member: member.clone(),
                amount: U128(needed),
            }
            .emit();
        }
        for member in &due.underfunded {
            let index = circle.index_of(member).unwrap();
            let needed = circle.deposit_amount - circle.members[index].deposited(round);
            let balance = self
                .automation
                .get(&(id, member.clone()))
                .map_or(0, |s| s.balance);
            Event::AutomatedDepositFailed {
                id: circle_id,
                member: member.clone(),
                needed: U128(needed),
                balance: U128(balance),
            }
            .emit();
        }
        for member in &due.claims {
            self.internal_withdraw(id, member.clone()).detach();
        }
        due
    }

    // ------------------------------------------------------------ callbacks

    #[private]
    pub fn on_payout(&mut self, circle_id: U64, member: AccountId, amount: U128) {
        if promise_succeeded() {
            Event::FundsWithdrawn {
                id: circle_id,
                member,
                amount,
            }
            .emit();
            return;
        }

        let circle = self.circle_mut(circle_id.0);
        let index = circle
            .index_of(&member)
            .unwrap_or_else(|| env::panic_str("NotMember"));
        circle.members[index].has_claimed = false;
        if circle.decommissioned {
            // Decommissioning skipped this round because it looked paid out.
            for m in circle.members.iter_mut() {
                m.refund_owed += m.deposits[index];
                m.deposits[index] = 0;
            }
        } else {
            circle.active = true;
        }

        Event::PayoutFailed {
            id: circle_id,
            member,
            amount,
        }
        .emit();
    }

    #[private]
    pub fn on_refund(&mut self, circle_id: U64, member: AccountId, amount: U128) {
        if promise_succeeded() {
            Event::RefundSent {
                id: circle_id,
                member,
                amount,
            }
            .emit();
            return;
        }
        let circle = self.circle_mut(circle_id.0);
        if let Some(index) = circle.index_of(&member) {
            circle.members[index].refund_owed += amount.0;
        }
    }

    #[private]
    pub fn on_prefund_withdrawn(&mut self, circle_id: U64, member: AccountId, amount: U128) {
        if promise_succeeded() {
            Event::PrefundWithdrawn {
                id: circle_id,
                member,
                amount,
            }
            .emit();
            return;
        }
        if let Some(settings) = self.automation.get_mut(&(circle_id.0, member)) {
            settings.balance += amount.0;
        }
    }

    // ---------------------------------------------------------------- views

    pub fn owner_id(&self) -> AccountId {
        self.owner_id.clone()
    }

    pub fn next_id(&self) -> U64 {
        U64(self.next_id)
    }

    pub fn is_token_allowed(&self, token: AccountId) -> bool {
        self.allowed_tokens.contains(&token)
    }

    pub fn get_allowed_tokens(&self) -> Vec<AccountId> {
        self.allowed_tokens.iter().cloned().collect()
    }

    pub fn get_circle(&self, circle_id: U64) -> CircleView {
        self.circle(circle_id.0)
            .view(circle_id.0, env::block_timestamp())
    }

    /// `None` for ids that don't exist.
    pub fn get_circles(&self, circle_ids: Vec<U64>) -> Vec<Option<CircleView>> {
        let now = env::block_timestamp();
        circle_ids
            .into_iter()
            .map(|id| self.circles.get(&id.0).map(|c| c.view(id.0, now)))
            .collect()
    }

    pub fn get_member_circles(&self, member: AccountId) -> Vec<U64> {
        self.member_circles
            .get(&member)
            .map(|ids| ids.iter().copied().map(U64).collect())
            .unwrap_or_default()
    }

    pub fn check_memberships(&self, member: AccountId, circle_ids: Vec<U64>) -> Vec<bool> {
        circle_ids
            .into_iter()
            .map(|id| {
                self.circles
                    .get(&id.0)
                    .is_some_and(|c| c.is_member(&member))
            })
            .collect()
    }

    pub fn get_circle_members(&self, circle_id: U64) -> Vec<AccountId> {
        self.circle(circle_id.0)
            .members
            .iter()
            .map(|m| m.account_id.clone())
            .collect()
    }

    pub fn get_member(&self, circle_id: U64, member: AccountId) -> Option<MemberView> {
        let circle = self.circle(circle_id.0);
        circle.index_of(&member).map(|index| {
            let m = &circle.members[index];
            MemberView {
                account_id: m.account_id.clone(),
                index: index as u32,
                has_claimed: m.has_claimed,
                last_deposit_round: U64(m.last_deposit_round),
                deposits: m.deposits.iter().copied().map(U128).collect(),
                refund_owed: U128(m.refund_owed),
            }
        })
    }

    /// Each member's deposit toward the current round.
    pub fn get_member_balances(&self, circle_id: U64) -> Vec<MemberBalance> {
        let circle = self.circle(circle_id.0);
        require!(!circle.decommissioned, "NotCommissioned");
        let current = circle.current_round(env::block_timestamp());
        circle
            .members
            .iter()
            .map(|m| MemberBalance {
                account_id: m.account_id.clone(),
                balance: U128(if m.last_deposit_round == current {
                    m.deposited(current)
                } else {
                    0
                }),
            })
            .collect()
    }

    pub fn is_active(&self, circle_id: U64) -> bool {
        self.circles.get(&circle_id.0).is_some_and(|c| c.active)
    }

    pub fn is_decommissioned(&self, circle_id: U64) -> bool {
        self.circles
            .get(&circle_id.0)
            .is_some_and(|c| c.decommissioned)
    }

    pub fn is_decommissionable(&self, circle_id: U64) -> bool {
        self.circles
            .get(&circle_id.0)
            .is_some_and(|c| c.is_decommissionable(env::block_timestamp()))
    }

    /// Whether any member can withdraw right now.
    pub fn is_withdrawable(&self, circle_id: U64) -> bool {
        let now = env::block_timestamp();
        self.circles.get(&circle_id.0).is_some_and(|c| {
            c.active
                && !c.is_decommissionable(now)
                && (0..c.members.len()).any(|i| c.active_claimable(i, now))
        })
    }

    pub fn is_member_withdrawable(&self, circle_id: U64, member: AccountId) -> bool {
        let now = env::block_timestamp();
        self.circles
            .get(&circle_id.0)
            .is_some_and(|c| c.active && c.index_of(&member).is_some_and(|i| c.claimable(i, now)))
    }

    pub fn current_round_withdrawer(&self, circle_id: U64) -> Option<AccountId> {
        let circle = self.circle(circle_id.0);
        if circle.decommissioned || !circle.active {
            return None;
        }
        let current = usize::try_from(circle.current_round(env::block_timestamp())).ok()?;
        circle.members.get(current).map(|m| m.account_id.clone())
    }

    pub fn circle_state(&self, circle_id: U64) -> CircleState {
        self.circle(circle_id.0).state(env::block_timestamp())
    }

    pub fn round_state(&self, circle_id: U64) -> RoundState {
        self.circle(circle_id.0).round_state(env::block_timestamp())
    }

    pub fn get_automation(&self, circle_id: U64, member: AccountId) -> Option<AutomationView> {
        self.automation
            .get(&(circle_id.0, member))
            .map(|s| AutomationView {
                deposits: s.deposits,
                claims: s.claims,
                balance: U128(s.balance),
            })
    }

    /// What `process_due` would do now. A keeper calls it only when this is non-empty.
    pub fn get_due(&self, circle_id: U64) -> Due {
        self.due(circle_id.0, env::block_timestamp())
    }
}

#[near]
impl FungibleTokenReceiver for SavingCircles {
    /// Deposits arrive here from `ft_transfer_call` on the circle's token. Any panic
    /// makes the token contract refund the full amount to the sender.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let DepositMsg {
            circle_id,
            member,
            prefund,
        } = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("InvalidDepositMsg"));
        let member = member.unwrap_or(sender_id);
        if prefund.unwrap_or(false) {
            self.internal_prefund(circle_id.0, member, token, amount.0);
        } else {
            self.internal_deposit(circle_id.0, member, token, amount.0);
        }
        PromiseOrValue::Value(U128(0))
    }
}

impl SavingCircles {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "NotOwner");
    }

    fn circle(&self, id: u64) -> &Circle {
        self.circles
            .get(&id)
            .unwrap_or_else(|| env::panic_str("NotCommissioned"))
    }

    fn circle_mut(&mut self, id: u64) -> &mut Circle {
        self.circles
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("NotCommissioned"))
    }

    /// Exists and has not been decommissioned.
    fn commissioned_mut(&mut self, id: u64) -> &mut Circle {
        let circle = self.circle_mut(id);
        require!(!circle.decommissioned, "NotCommissioned");
        circle
    }

    fn internal_deposit(&mut self, id: u64, member: AccountId, token: AccountId, amount: u128) {
        let now = env::block_timestamp();
        let circle = self.circle_mut(id);

        require!(circle.active, "NotActive");
        require!(!circle.decommissioned, "NotCommissioned");
        require!(token == circle.token, "TokenNotAllowed");
        let index = circle
            .index_of(&member)
            .unwrap_or_else(|| env::panic_str("NotMember"));

        let round = match circle.open_round(now) {
            Ok(round) => round,
            Err(e) => env::panic_str(e),
        };
        circle.record_deposit(index, round, amount);

        Event::FundsDeposited {
            id: U64(id),
            member,
            amount: U128(amount),
        }
        .emit();
    }

    /// Adds to a member's pre-funded balance. Allowed before the circle starts.
    fn internal_prefund(&mut self, id: u64, member: AccountId, token: AccountId, amount: u128) {
        let circle = self.circle(id);
        require!(!circle.decommissioned, "NotCommissioned");
        require!(token == circle.token, "TokenNotAllowed");
        require!(circle.is_member(&member), "NotMember");
        // Settings are created, and their storage paid, by `set_automation`.
        let settings = self
            .automation
            .get_mut(&(id, member.clone()))
            .unwrap_or_else(|| env::panic_str("AutomationNotSet"));
        settings.balance = settings
            .balance
            .checked_add(amount)
            .unwrap_or_else(|| env::panic_str("BalanceOverflow"));

        Event::Prefunded {
            id: U64(id),
            member,
            amount: U128(amount),
        }
        .emit();
    }

    fn due(&self, id: u64, now: u64) -> Due {
        let circle = self.circle(id);
        let settings = |m: &Member| self.automation.get(&(id, m.account_id.clone()));
        let mut due = Due::default();

        if let Ok(round) = circle.open_round(now) {
            for m in &circle.members {
                let needed = circle.deposit_amount - m.deposited(round);
                if let Some(s) = settings(m).filter(|s| s.deposits && needed > 0) {
                    if s.balance >= needed {
                        due.deposits.push(m.account_id.clone());
                    } else {
                        due.underfunded.push(m.account_id.clone());
                    }
                }
            }
        }

        // As in the Solidity contract, automatic claims wait for the member's round to end.
        if circle.active && !circle.is_decommissionable(now) {
            for (index, m) in circle.members.iter().enumerate() {
                if settings(m).is_some_and(|s| s.claims)
                    && now >= circle.round_end(index as u64)
                    && circle.active_claimable(index, now)
                {
                    due.claims.push(m.account_id.clone());
                }
            }
        }
        due
    }

    fn internal_withdraw(&mut self, id: u64, member: AccountId) -> Promise {
        let now = env::block_timestamp();
        let circle = self.circle_mut(id);

        require!(circle.active, "NotActive");
        require!(!circle.decommissioned, "NotCommissioned");
        let index = circle
            .index_of(&member)
            .unwrap_or_else(|| env::panic_str("NotMember"));
        require!(circle.claimable(index, now), "NotWithdrawable");

        let amount = circle.payout_amount();
        circle.members[index].has_claimed = true;
        if circle.all_claimed() {
            circle.active = false;
        }
        let token = circle.token.clone();

        // State changes first; on_payout reverts them if the transfer fails.
        ft_transfer(token, member.clone(), amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_payout(U64(id), member, U128(amount)),
        )
    }

    fn add_member_circle(&mut self, member: &AccountId, id: u64) {
        match self.member_circles.get_mut(member) {
            Some(ids) => ids.push(id),
            None => {
                self.member_circles.insert(member.clone(), vec![id]);
            }
        }
    }

    fn remove_member_circle(&mut self, member: &AccountId, id: u64) {
        if let Some(ids) = self.member_circles.get_mut(member) {
            ids.retain(|&i| i != id);
        }
    }

    /// Charges the caller for storage added since `initial`, refunding the rest.
    fn charge_storage(&mut self, initial: u64) {
        // `store` collections buffer writes; flush so storage_usage reflects them.
        self.circles.flush();
        self.member_circles.flush();
        self.automation.flush();
        let used = env::storage_usage().saturating_sub(initial);
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!(
                "Attach at least {} yoctoNEAR for storage",
                cost.as_yoctonear()
            )
        );
        let refund = attached.saturating_sub(cost);
        if !refund.is_zero() {
            Promise::new(env::predecessor_account_id())
                .transfer(refund)
                .detach();
        }
    }
}

fn ft_transfer(token: AccountId, receiver: AccountId, amount: u128) -> Promise {
    ext_ft_core::ext(token)
        .with_attached_deposit(ONE_YOCTO)
        .with_static_gas(GAS_FOR_FT_TRANSFER)
        .ft_transfer(receiver, U128(amount), None)
}

fn promise_succeeded() -> bool {
    // `ft_transfer` returns nothing; a token returning data still transferred, so only
    // an explicit failure counts. Treating TooLong as failure would allow a double payout.
    !matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed))
}
