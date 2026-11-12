import { view } from "./rpc";
import { GAS, NEAR_CONFIG } from "./config";
import { nearToYocto } from "../format";
import type { Call, StorageBalance } from "./types";

export const token = {
  balanceOf: (tokenId: string, accountId: string) =>
    view<string>(tokenId, "ft_balance_of", { account_id: accountId }),

  storageBalanceOf: (tokenId: string, accountId: string) =>
    view<StorageBalance>(tokenId, "storage_balance_of", {
      account_id: accountId,
    }),
};

export const tokenCalls = {
  /** Registers an account with the token so it can receive payouts. */
  storageDeposit: (tokenId: string, accountId: string): Call => ({
    receiverId: tokenId,
    methodName: "storage_deposit",
    args: { account_id: accountId, registration_only: true },
    gasTGas: GAS.default,
    depositYocto: nearToYocto("0.00125"),
  }),

  /** Testnet faucet: the test token mints to anyone and registers them. */
  mintTestToken: (accountId: string, amount: string): Call => ({
    receiverId: NEAR_CONFIG.token.id,
    methodName: "mint",
    args: { account_id: accountId, amount },
    gasTGas: GAS.default,
    depositYocto: "0",
  }),
};
