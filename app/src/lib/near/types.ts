// Mirrors the JSON views in contracts/src/lib.rs. U64 and U128 arrive as
// decimal strings; timestamps are nanoseconds.

export type U64 = string;
export type U128 = string;

export type CircleView = {
  id: U64;
  owner: string;
  token: string;
  deposit_amount: U128;
  deposit_interval: U64;
  start_time: U64 | null;
  end_time: U64 | null;
  current_index: U64;
  active: boolean;
  decommissioned: boolean;
  members: string[];
};

/** From `get_member(circle_id, member)`. */
export type MemberView = {
  account_id: string;
  index: number;
  has_claimed: boolean;
  last_deposit_round: U64;
  deposits: U128[];
  refund_owed: U128;
};

export type MemberBalance = {
  account_id: string;
  balance: U128;
};

export type CircleState =
  | "NotStarted"
  | "Active"
  | "DepositInProgress"
  | "DepositComplete"
  | "Expired"
  | "Decommissioned"
  | "MissedDeposit";

export type RoundState =
  | "NotStarted"
  | "DepositInProgress"
  | "Claimable"
  | "Claimed";

export type StorageBalance = { total: U128; available: U128 } | null;

/** A function call the wallet signs. Gas in TGas, deposit in yoctoNEAR. */
export type Call = {
  receiverId: string;
  methodName: string;
  args: object;
  gasTGas: number;
  depositYocto: string;
};
