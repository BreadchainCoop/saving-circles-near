import { view } from "./rpc";
import { GAS, NEAR_CONFIG, ONE_YOCTO, STORAGE_DEPOSIT_NEAR } from "./config";
import { nearToYocto } from "../format";
import type {
  Call,
  CircleState,
  CircleView,
  MemberBalance,
  MemberView,
  RoundState,
} from "./types";

const C = () => NEAR_CONFIG.contractId;
const id = (circleId: string) => ({ circle_id: circleId });

// ------------------------------------------------------------------ views

export const circles = {
  get: (circleId: string) => view<CircleView>(C(), "get_circle", id(circleId)),
  many: (circleIds: string[]) =>
    view<(CircleView | null)[]>(C(), "get_circles", { circle_ids: circleIds }),
  nextId: () => view<string>(C(), "next_id"),
  ofMember: (member: string) =>
    view<string[]>(C(), "get_member_circles", { member }),
  member: (circleId: string, member: string) =>
    view<MemberView | null>(C(), "get_member", { ...id(circleId), member }),
  /** Every member's view in payout order: one `get_member` per member, in parallel (max 25). */
  memberViews: async (circleId: string, members: string[]) => {
    const views = await Promise.all(
      members.map((m) => circles.member(circleId, m))
    );
    return views.filter((v): v is MemberView => v !== null);
  },
  balances: (circleId: string) =>
    view<MemberBalance[]>(C(), "get_member_balances", id(circleId)),
  state: (circleId: string) =>
    view<CircleState>(C(), "circle_state", id(circleId)),
  roundState: (circleId: string) =>
    view<RoundState>(C(), "round_state", id(circleId)),
  currentWithdrawer: (circleId: string) =>
    view<string | null>(C(), "current_round_withdrawer", id(circleId)),
  isMemberWithdrawable: (circleId: string, member: string) =>
    view<boolean>(C(), "is_member_withdrawable", { ...id(circleId), member }),
  isDecommissionable: (circleId: string) =>
    view<boolean>(C(), "is_decommissionable", id(circleId)),
  allowedTokens: () => view<string[]>(C(), "get_allowed_tokens"),
};

// ------------------------------------------------------------------ calls
// Each builder returns plain Call objects; the wallet provider signs them.

const call = (
  methodName: string,
  args: object,
  opts: { gasTGas?: number; depositYocto?: string } = {}
): Call => ({
  receiverId: C(),
  methodName,
  args,
  gasTGas: opts.gasTGas ?? GAS.default,
  depositYocto: opts.depositYocto ?? "0",
});

const storageFor = (members: number) =>
  nearToYocto(
    (
      Number(STORAGE_DEPOSIT_NEAR.create) +
      Number(STORAGE_DEPOSIT_NEAR.perMember) * members
    ).toFixed(6)
  );

export const circleCalls = {
  /** `deposit_amount` in token units (U128 string), `deposit_interval` in ns. */
  create: (args: {
    token: string;
    deposit_amount: string;
    deposit_interval: string;
  }) => call("create", { args }, { depositYocto: storageFor(1) }),

  addMembers: (circleId: string, members: string[]) =>
    call(
      "add_members",
      { ...id(circleId), members },
      { depositYocto: storageFor(members.length) }
    ),

  start: (circleId: string) => call("start", id(circleId)),

  withdraw: (circleId: string) =>
    call("withdraw", id(circleId), { gasTGas: GAS.withdraw }),

  decommission: (circleId: string) => call("decommission", id(circleId)),

  claimRefund: (circleId: string, member: string) =>
    call(
      "claim_refund",
      { ...id(circleId), member },
      { gasTGas: GAS.withdraw }
    ),

  /** Deposit goes through the token: NEP-141 has no allowances. */
  deposit: (
    circle: Pick<CircleView, "id" | "token" | "deposit_amount">
  ): Call => ({
    receiverId: circle.token,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: C(),
      amount: circle.deposit_amount,
      msg: JSON.stringify({ circle_id: circle.id }),
    },
    gasTGas: GAS.ftTransferCall,
    depositYocto: ONE_YOCTO,
  }),
};
