#!/usr/bin/env bash
# Creates a live demo circle on the testnet deployment: three member accounts, round 0
# fully deposited and paid out to the first member. Every member then turns on automation
# and pre-funds the two remaining rounds, so a keeper running process_due deposits and pays
# out the rest of the circle with no one signing in. Re-run any time for a fresh circle.
#
#   NEAR_ACCOUNT=you.testnet scripts/seed-demo.sh
#   NEAR_ACCOUNT=you.testnet CIRCLE_ID=0 scripts/seed-demo.sh   # automate an existing demo circle
#
# Run scripts/deploy-testnet.sh first. Members are sub-accounts of $NEAR_ACCOUNT, created
# on first run; their keys go to ~/.near-credentials. With CIRCLE_ID, the circle must be one
# this script seeded. Members who already have a pre-funded balance are left as they are.
set -euo pipefail

: "${NEAR_ACCOUNT:?set NEAR_ACCOUNT to the account that ran deploy-testnet.sh}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK=testnet
CIRCLES=$(sed -n 's/.*"contract": "\(.*\)".*/\1/p' "$ROOT/deployments/testnet.json")
TOKEN=$(sed -n 's/.*"token": "\(.*\)".*/\1/p' "$ROOT/deployments/testnet.json")
DEPOSIT=10000000 # 10 tUSDC
# A week per round keeps the circle live through judging; override for a quick demo.
INTERVAL="${INTERVAL:-604800000000000}"
MEMBERS=(alice bob carol)

near_tx() {
  near "$@" network-config "$NETWORK" sign-with-legacy-keychain send
}

call() { # signer contract method json-args deposit
  near_tx contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas '100.0 Tgas' attached-deposit "$5" sign-as "$1"
}

ids=()
for m in "${MEMBERS[@]}"; do
  id="$m.$NEAR_ACCOUNT"
  ids+=("$id")
  if ! near account view-account-summary "$id" network-config "$NETWORK" now >/dev/null 2>&1; then
    near_tx account create-account fund-myself "$id" '0.2 NEAR' autogenerate-new-keypair \
      save-to-legacy-keychain sign-as "$NEAR_ACCOUNT"
  fi
  call "$NEAR_ACCOUNT" "$TOKEN" mint "{\"account_id\":\"$id\",\"amount\":\"$((DEPOSIT * 3))\"}" '0 NEAR'
done

owner="${ids[0]}"
if [ -n "${CIRCLE_ID:-}" ]; then
  circle_id="$CIRCLE_ID"
else
  circle_id=$(call "$owner" "$CIRCLES" create \
    "{\"args\":{\"token\":\"$TOKEN\",\"deposit_amount\":\"$DEPOSIT\",\"deposit_interval\":\"$INTERVAL\"}}" \
    '0.05 NEAR' 2>/dev/null | tail -1 | tr -d '"[:space:]')
  echo "Created circle $circle_id"

  call "$owner" "$CIRCLES" add_members \
    "{\"circle_id\":\"$circle_id\",\"members\":[\"${ids[1]}\",\"${ids[2]}\"]}" '0.05 NEAR'
  call "$owner" "$CIRCLES" start "{\"circle_id\":\"$circle_id\"}" '0.05 NEAR'

  for id in "${ids[@]}"; do
    call "$id" "$TOKEN" ft_transfer_call \
      "{\"receiver_id\":\"$CIRCLES\",\"amount\":\"$DEPOSIT\",\"msg\":\"{\\\"circle_id\\\":\\\"$circle_id\\\"}\"}" \
      '1 yoctoNEAR'
  done
  call "$owner" "$CIRCLES" withdraw "{\"circle_id\":\"$circle_id\"}" '0 NEAR'
fi

prefunded() { # member: their pre-funded balance in this circle, empty if none
  near contract call-function as-read-only "$CIRCLES" get_automation \
    json-args "{\"circle_id\":\"$circle_id\",\"member\":\"$1\"}" network-config "$NETWORK" now 2>/dev/null \
    | sed -n 's/.*"balance": *"\([0-9]*\)".*/\1/p' | head -1
}

# Rounds 1 and 2 run themselves: each member pre-funds both deposits, and a keeper's
# process_due moves them in each round and pays out bob, then carol. A member who already
# has a pre-funded balance is skipped, so re-running doesn't pre-fund twice.
for id in "${ids[@]}"; do
  balance=$(prefunded "$id")
  if [ -n "$balance" ] && [ "$balance" != 0 ]; then
    echo "$id already has $balance pre-funded in circle $circle_id; skipping"
    continue
  fi
  call "$id" "$CIRCLES" set_automation \
    "{\"circle_id\":\"$circle_id\",\"deposits\":true,\"claims\":true}" '0.01 NEAR'
  call "$id" "$TOKEN" ft_transfer_call \
    "{\"receiver_id\":\"$CIRCLES\",\"amount\":\"$((DEPOSIT * 2))\",\"msg\":\"{\\\"circle_id\\\":\\\"$circle_id\\\",\\\"prefund\\\":true}\"}" \
    '1 yoctoNEAR'
done

echo "Demo circle $circle_id: round 0 paid to $owner; ${ids[1]} is next."
echo "Automation is on and pre-funded for every member; a keeper runs the remaining rounds."
