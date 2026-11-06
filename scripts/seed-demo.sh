#!/usr/bin/env bash
# Creates a live demo circle on the testnet deployment: three member accounts, round 0
# fully deposited and paid out to the first member. Re-run any time for a fresh circle.
#
#   NEAR_ACCOUNT=you.testnet scripts/seed-demo.sh
#
# Run scripts/deploy-testnet.sh first. Members are sub-accounts of $NEAR_ACCOUNT, created
# on first run; their keys go to ~/.near-credentials.
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

echo "Demo circle $circle_id: round 0 paid to $owner; ${ids[1]} is next."
