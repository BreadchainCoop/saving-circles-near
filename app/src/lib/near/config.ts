import testnet from "../../../../deployments/testnet.json";

/** Where the app points. Defaults to the committed testnet deployment. */
export const NEAR_CONFIG = {
  networkId: "testnet" as const,
  rpcUrl: "https://test.rpc.fastnear.com",
  explorerUrl: "https://testnet.nearblocks.io",
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID || testnet.contract,
  token: {
    id: testnet.token,
    symbol: "tUSDC",
    decimals: testnet.token_decimals,
  },
};

/** Gas in TGas, converted to gas units by the client. */
export const GAS = {
  default: 30,
  ftTransferCall: 100,
  withdraw: 100,
};

/** 1 yoctoNEAR: required by NEP-141 `ft_transfer_call`. */
export const ONE_YOCTO = "1";

/**
 * NEAR attached to `create` and `add_members` to pay for storage. The contract
 * refunds what it doesn't use, so this only needs to be large enough.
 */
export const STORAGE_DEPOSIT_NEAR = {
  create: "0.01",
  perMember: "0.005",
};
