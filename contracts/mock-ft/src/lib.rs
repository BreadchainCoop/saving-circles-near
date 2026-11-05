//! NEP-141 test token with an open `mint`. Stands in for USDC in integration tests and on
//! testnet, where no canonical USDC exists. Never deploy to mainnet.

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{
    env, log, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

/// 10,000 tokens at 6 decimals per call, so demo balances stay realistic.
pub const MAX_MINT: u128 = 10_000_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    token: FungibleToken,
    symbol: String,
    name: String,
    decimals: u8,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(name: String, symbol: String, decimals: u8) -> Self {
        Self {
            token: FungibleToken::new(StorageKey::Token),
            symbol,
            name,
            decimals,
        }
    }

    /// Registers `account_id` if needed, paying its storage from this contract's balance
    /// so a demo user can get tokens in one call.
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(amount.0 > 0 && amount.0 <= MAX_MINT, "Invalid mint amount");
        if !self.token.accounts.contains_key(&account_id) {
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        log!("Minted {} to {}", amount.0, account_id);
    }
}

#[near]
impl FungibleTokenCore for MockFt {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for MockFt {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for MockFt {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for MockFt {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: self.name.clone(),
            symbol: self.symbol.clone(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: self.decimals,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn setup() -> MockFt {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(accounts(0))
            .build());
        MockFt::new("Test USDC".into(), "tUSDC".into(), 6)
    }

    #[test]
    fn mint_registers_and_credits() {
        let mut ft = setup();
        ft.mint(accounts(1), U128(5));
        ft.mint(accounts(1), U128(7));
        assert_eq!(ft.ft_balance_of(accounts(1)).0, 12);
        assert_eq!(ft.ft_total_supply().0, 12);
    }

    #[test]
    #[should_panic(expected = "Invalid mint amount")]
    fn mint_is_capped() {
        setup().mint(accounts(1), U128(MAX_MINT + 1));
    }
}
