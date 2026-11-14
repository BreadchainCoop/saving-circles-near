import { view } from "./rpc";
import { GAS, NEAR_CONFIG, ONE_YOCTO, STORAGE_DEPOSIT_NEAR } from "./config";
import { nearToYocto } from "../format";
import type { Call, CircleView, U128 } from "./types";

/*
 * Automatic deposits and claims, the NEAR take on AutomaticSavingCircles.sol
 * (contracts/README.md, "Automatic deposits and claims"). NEP-141 has no
 * allowances, so instead of approving a spend a member turns automation on and
 * pre-funds a balance in the contract. A keeper calls `process_due` each
 * minute: it makes the current round's deposit from that balance and pays out
 * members whose round has ended.
 */

const C = () => NEAR_CONFIG.contractId;

export type Automation = {
  deposits: boolean;
  claims: boolean;
  /** Pre-funded tokens left for automatic deposits, in token units. */
  balance: U128;
};

const OFF: Automation = { deposits: false, claims: false, balance: "0" };

/** A member's automation settings; all off until their first `set_automation`. */
export const getAutomation = async (circleId: string, member: string) =>
  (await view<Automation | null>(C(), "get_automation", { circle_id: circleId, member })) ?? OFF;

export const automationCalls = {
  /**
   * Sets both flags at once: pass the current value of the one not changing.
   * The first call stores the settings and charges their storage to the
   * attached NEAR; the contract refunds the rest, so attaching it every time is safe.
   */
  set: (circleId: string, settings: { deposits: boolean; claims: boolean }): Call => ({
    receiverId: C(),
    methodName: "set_automation",
    args: { circle_id: circleId, ...settings },
    gasTGas: GAS.default,
    depositYocto: nearToYocto(STORAGE_DEPOSIT_NEAR.automation),
  }),

  /** Returns the whole pre-funded balance. Works in any circle state. */
  withdrawPrefund: (circleId: string): Call => ({
    receiverId: C(),
    methodName: "withdraw_prefund",
    args: { circle_id: circleId },
    gasTGas: GAS.withdraw,
    depositYocto: "0",
  }),

  /**
   * Adds to the pre-funded balance through the token, like a deposit. The
   * contract rejects it (and the token refunds) until `set_automation` has run,
   * so send it after that call.
   */
  prefund: (circle: Pick<CircleView, "id" | "token">, amount: string): Call => ({
    receiverId: circle.token,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: C(),
      amount,
      msg: JSON.stringify({ circle_id: circle.id, prefund: true }),
    },
    gasTGas: GAS.ftTransferCall,
    depositYocto: ONE_YOCTO,
  }),
};
