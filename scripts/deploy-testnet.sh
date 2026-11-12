#!/usr/bin/env bash
# Deploys the Saving Circles contract and a test token to NEAR testnet as sub-accounts of
# $NEAR_ACCOUNT, then writes deployments/testnet.json for the frontend.
#
#   NEAR_ACCOUNT=you.testnet scripts/deploy-testnet.sh
#
# Requires near-cli-rs (`near`) and cargo-near. $NEAR_ACCOUNT needs about 8 NEAR and its
# key in the legacy keychain (~/.near-credentials). A new funded account:
#   near account create-account sponsor-by-faucet-service you.testnet \
#     autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
set -euo pipefail

: "${NEAR_ACCOUNT:?set NEAR_ACCOUNT to the testnet account that pays for the deploy}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK=testnet
CIRCLES="circles.$NEAR_ACCOUNT"
TOKEN="usdc.$NEAR_ACCOUNT"

near_tx() {
  near "$@" network-config "$NETWORK" sign-with-legacy-keychain send
}

call() { # signer contract method json-args deposit
  near_tx contract call-function as-transaction "$2" "$3" json-args "$4" \
    prepaid-gas '100.0 Tgas' attached-deposit "$5" sign-as "$1"
}

exists() {
  near account view-account-summary "$1" network-config "$NETWORK" now >/dev/null 2>&1
}

sub_account() { # name balance
  if exists "$1"; then
    echo "$1 exists, redeploying in place"
  else
    near_tx account create-account fund-myself "$1" "$2" autogenerate-new-keypair \
      save-to-legacy-keychain sign-as "$NEAR_ACCOUNT"
  fi
}

# Saving Circles is built reproducibly (needs Docker) so NearBlocks can verify it. The build
# records the commit, and verification fetches it from GitHub, so it must be pushed.
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "Commit, stash or remove your changes, including untracked files: the reproducible build needs a clean tree." >&2
  exit 1
fi
if [ -z "$(git -C "$ROOT" branch -r --contains HEAD)" ]; then
  echo "Push $(git -C "$ROOT" rev-parse --short HEAD) first: NearBlocks verifies from GitHub." >&2
  exit 1
fi
(cd "$ROOT/contracts" && cargo near build reproducible-wasm \
  && cargo near build non-reproducible-wasm --manifest-path mock-ft/Cargo.toml)

# Contract storage is staked from each account's balance: ~1.6 NEAR for the token,
# ~2.3 NEAR for Saving Circles, plus headroom for circle and token-account storage.
sub_account "$TOKEN" '3 NEAR'
sub_account "$CIRCLES" '4 NEAR'

initialized() { # contract view-method
  near contract call-function as-read-only "$1" "$2" json-args '{}' \
    network-config "$NETWORK" now >/dev/null 2>&1
}

deploy() { # account wasm view-method init-args [migrate-method]
  if initialized "$1" "$3" && [ -n "${5:-}" ]; then
    near_tx contract deploy "$1" use-file "$2" with-init-call "$5" json-args '{}' \
      prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR'
  elif initialized "$1" "$3"; then
    near_tx contract deploy "$1" use-file "$2" without-init-call
  else
    near_tx contract deploy "$1" use-file "$2" with-init-call new json-args "$4" \
      prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR'
  fi
}

deploy "$TOKEN" "$ROOT/contracts/target/near/mock_ft/mock_ft.wasm" ft_metadata \
  '{"name":"Test USDC","symbol":"tUSDC","decimals":6}'
# `migrate` upgrades existing state in place, keeping circles; it is a no-op when current.
deploy "$CIRCLES" "$ROOT/contracts/target/near/saving_circles.wasm" owner_id \
  "{\"owner_id\":\"$NEAR_ACCOUNT\"}" migrate

call "$NEAR_ACCOUNT" "$CIRCLES" set_token_allowed "{\"token\":\"$TOKEN\",\"allowed\":true}" '0 NEAR'
# The contract needs a token account to receive deposits.
call "$NEAR_ACCOUNT" "$TOKEN" storage_deposit "{\"account_id\":\"$CIRCLES\"}" '0.00125 NEAR'

mkdir -p "$ROOT/deployments"
cat > "$ROOT/deployments/testnet.json" <<EOF
{
  "network": "$NETWORK",
  "contract": "$CIRCLES",
  "token": "$TOKEN",
  "token_decimals": 6,
  "owner": "$NEAR_ACCOUNT",
  "commit": "$(git -C "$ROOT" rev-parse --short HEAD)"
}
EOF
echo "Deployed. See deployments/testnet.json"
