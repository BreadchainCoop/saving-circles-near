import testnet from "../../../../deployments/testnet.json";

/**
 * Network endpoints. NEXT_PUBLIC_NEAR_NETWORK picks one at build time; testnet is the default.
 * Next.js inlines NEXT_PUBLIC_* values only when they are read by their literal names.
 */
const NETWORKS = {
  testnet: {
    rpcUrl: "https://test.rpc.fastnear.com",
    explorerUrl: "https://testnet.nearblocks.io",
    accountSuffix: "testnet",
  },
  mainnet: {
    rpcUrl: "https://free.rpc.fastnear.com",
    explorerUrl: "https://nearblocks.io",
    accountSuffix: "near",
  },
} as const;

type NetworkId = keyof typeof NETWORKS;

const network = process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet";
if (!Object.hasOwn(NETWORKS, network)) {
  throw new Error(`NEXT_PUBLIC_NEAR_NETWORK must be "testnet" or "mainnet", not "${network}"`);
}
const networkId = network as NetworkId;

// deployments/testnet.json describes the testnet deployment only. Any other network names its
// contract and token explicitly, so the app can't point mainnet users at testnet accounts.
const defaults = networkId === "testnet" ? testnet : null;
const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID || defaults?.contract;
const tokenId = process.env.NEXT_PUBLIC_TOKEN_ID || defaults?.token;
if (!contractId || !tokenId) {
  throw new Error(`Set NEXT_PUBLIC_CONTRACT_ID and NEXT_PUBLIC_TOKEN_ID for ${networkId}`);
}
// The committed test token, which mints to anyone, unless a token is named explicitly.
const testToken = networkId === "testnet" && !process.env.NEXT_PUBLIC_TOKEN_ID;
const decimals = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || defaults?.token_decimals || 6);
if (!Number.isInteger(decimals) || decimals < 0) {
  throw new Error(`NEXT_PUBLIC_TOKEN_DECIMALS must be a whole number, not "${process.env.NEXT_PUBLIC_TOKEN_DECIMALS}"`);
}

/** Where the app points. Defaults to the committed testnet deployment. */
export const NEAR_CONFIG = {
  networkId,
  /** "NEAR testnet" or "NEAR mainnet", for labels. */
  networkName: `NEAR ${networkId}`,
  ...NETWORKS[networkId],
  rpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL || NETWORKS[networkId].rpcUrl,
  contractId,
  token: {
    id: tokenId,
    symbol: process.env.NEXT_PUBLIC_TOKEN_SYMBOL || (testToken ? "tUSDC" : "USDC"),
    decimals,
  },
  /** The test token mints to anyone; real tokens don't. */
  faucet: testToken,
  /**
   * The account that calls `process_due` on this contract. Bread's keeper serves the committed
   * testnet deployment only; anywhere else, automatic deposits and claims need one named here.
   * Without a keeper the app hides the automation switches, since nothing would run them.
   */
  keeper:
    process.env.NEXT_PUBLIC_KEEPER_ID ||
    (networkId === "testnet" && !process.env.NEXT_PUBLIC_CONTRACT_ID ? "bread-keeper.testnet" : null),
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
  /** `set_automation`, first call only; attached every time and refunded when unused. */
  automation: "0.01",
};
