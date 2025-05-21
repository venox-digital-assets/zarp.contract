# 📜 ZARP Solana Makefile — epic token shenanigans 🎉
.DEFAULT_GOAL := help

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -euo pipefail -c  # keep -euo, remove -x for silent execution

# Increase HTTP client timeout for slow RPC endpoints
export SOLANA_HTTP_CLIENT_TIMEOUT=60

# Load per-network WAIT_TIME if set; default to 5s
-include .make.env
WAIT_TIME ?= 5

# CLI program definitions
SPL_PROG     := TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
SPL          := spl-token --program-id $(SPL_PROG)
SPL_BASE     := spl-token

# Logging and artifact directories
LOG_DIR      := .create-token
LOG_FILE     := $(LOG_DIR)/create-token-output.log
ADDR_FILE    := $(LOG_DIR)/token_address.txt
ACCT_FILE    := $(LOG_DIR)/account_address.txt

# Metadata parameters
TOKEN_NAME   := "ZARP Stablecoin"
TOKEN_SYMBOL := "ZARP"
TOKEN_URI    := "https://raw.githubusercontent.com/venox-digital-assets/zarp.contract/main/public/sol-metadata.json"

# Override default shell to bash for cross-user consistency
default_shell:
	@echo "Using shell: $$SHELL"

#───────────────────────────────────────────────────────────────────────────────
# Help (default)
#───────────────────────────────────────────────────────────────────────────────
.PHONY: help check-vars confirm local-sol reset-local-sol create-base initialize-metadata create-account transfer-permissions mint-tokens create-init-display create-token set-local set-devnet set-testnet set-mainnet

help:
	@echo "Usage: make [target]"
	@echo
	@echo "Targets:"
	@echo "  help                   Show this help message"
	@echo "  check-vars             Validate required env vars"
	@echo "  confirm                Review and confirm before running"
	@echo "  create-token           Create & configure a brand-new ZARP token 🎁"
	@echo "  mint-tokens            Mint 100,000 ZARP tokens 💰"
	@echo "  local-sol              Launch local Solana validator 🚀"
	@echo "  set-local              Switch Solana CLI to Localnet 🏠"
	@echo "  set-devnet             Switch Solana CLI to Devnet 🌐"
	@echo "  set-testnet            Switch Solana CLI to Testnet 🔧"
	@echo "  set-mainnet            Switch Solana CLI to Mainnet-Beta 🏛️"
	@echo

check-vars:
	@test -n "$(DEPLOYER_ADDRESS)" || { echo >&2 "Error: DEPLOYER_ADDRESS must be set"; exit 1; }
	@test -n "$(MINT_AND_BURN_ADDRESS)" || { echo >&2 "Error: MINT_AND_BURN_ADDRESS must be set"; exit 1; }
	@test -n "$(OWNER_ADDRESS)" || { echo >&2 "Error: OWNER_ADDRESS must be set"; exit 1; }

confirm: check-vars
	@mkdir -p $(LOG_DIR)
	@tee -a $(LOG_FILE) <<EOF
	-------------------------------
	Active Solana config
	-------------------------------
	$$(solana config get)
	-------------------------------
	Active Variables
	-------------------------------
	MINT_AND_BURN_ADDRESS=$(MINT_AND_BURN_ADDRESS)
	DEPLOYER_ADDRESS=$(DEPLOYER_ADDRESS)
	OWNER_ADDRESS=$(OWNER_ADDRESS)
	-------------------------------
	EOF
	@read -p "Proceed? [y/N] " ans; test "$${ans,,}" = y

#───────────────────────────────────────────────────────────────────────────────
# Validator Control
#───────────────────────────────────────────────────────────────────────────────
local-sol:
	@echo "🔧 Starting local solana-test-validator (resetting ledger)..."
	@RUST_LOG=debug solana-test-validator --reset

reset-local-sol: local-sol

#───────────────────────────────────────────────────────────────────────────────
# Network Configuration
#───────────────────────────────────────────────────────────────────────────────
.PHONY: set-local set-devnet set-testnet set-mainnet

set-local:
	@echo "🔀 Switching Solana CLI to Localnet"
	@solana config set --url http://localhost:8899
	@echo "WAIT_TIME=0.5" > .make.env
	@echo "Set WAIT_TIME=0.5 for Local"

set-devnet:
	@echo "🔀 Switching Solana CLI to Devnet"
	@solana config set --url https://api.devnet.solana.com
	@echo "WAIT_TIME=1" > .make.env
	@echo "Set WAIT_TIME=1 for Devnet"

set-testnet:
	@echo "🔀 Switching Solana CLI to Testnet"
	@solana config set --url https://api.testnet.solana.com
	@solana config set --commitment confirmed
	@echo "WAIT_TIME=5" > .make.env
	@echo "Set WAIT_TIME=5 for Testnet"

set-mainnet:
	@echo "🔀 Switching Solana CLI to Mainnet-Beta"
	@solana config set --url https://api.mainnet-beta.solana.com
	@solana config set --commitment confirmed
	@solana config set usb://ledger?key=0/0 
	@echo "WAIT_TIME=5" > .make.env
	@echo "Set WAIT_TIME=5 for Mainnet-Beta"

#───────────────────────────────────────────────────────────────────────────────
# Token creation and management pipeline
#───────────────────────────────────────────────────────────────────────────────
# Ensure `spl-token` CLI is installed
check-spl-cli:
	@command -v spl-token >/dev/null \
		|| { echo >&2 "Error: spl-token CLI not found. Install via 'solana install spl-token' or see https://spl.solana.com/token"; exit 1; }

# Token creation depends on the `spl-token` CLI
create-base: check-spl-cli confirm
	@mkdir -p $(LOG_DIR)
	@echo ">> Creating base token" > $(LOG_FILE)
	T_OUT=$$($(SPL) create-token --decimals 6 \
		--enable-metadata \
		--enable-freeze --enable-close)
	@echo "$$T_OUT" | tee -a $(LOG_FILE)
	@TOKEN_ADDRESS=$$(echo "$$T_OUT" | grep 'Address:' | awk '{print $$2}')
	@echo "Token Address: $$TOKEN_ADDRESS"
	@echo "$$TOKEN_ADDRESS" > $(ADDR_FILE)

initialize-metadata: create-base
	@TOKEN=$$(cat $(ADDR_FILE))
	@echo "==> Waiting $(WAIT_TIME)s for indexing before metadata init..." | tee -a $(LOG_FILE)
	@sleep $(WAIT_TIME)
	@echo "==> Initializing metadata for $$TOKEN" | tee -a $(LOG_FILE)
	@$(SPL) initialize-metadata $$TOKEN $(TOKEN_NAME) $(TOKEN_SYMBOL) $(TOKEN_URI) 2>&1 | tee -a $(LOG_FILE)

create-account: initialize-metadata
	@TOKEN=$$(cat $(ADDR_FILE))
	@echo "==> Creating account for $$TOKEN" | tee -a $(LOG_FILE)
	@echo "==> Waiting for RPC index sync..." | tee -a $(LOG_FILE)
	@sleep 5
	@A_OUT=$$($(SPL) create-account $$TOKEN)
	@echo "$$A_OUT" | tee -a $(LOG_FILE)
	@ACCOUNT_ADDRESS=$$(echo "$$A_OUT" | grep 'Creating account' | awk '{print $$3}')
	@echo "Account Address: $$ACCOUNT_ADDRESS"
	@echo "$$ACCOUNT_ADDRESS" > $(ACCT_FILE)

transfer-permissions: create-account
	@TOKEN=$$(cat $(ADDR_FILE))
	@ACCT=$$(cat $(ACCT_FILE))
	@echo "==> Waiting $(WAIT_TIME)s for indexing before permission transfer..." | tee -a $(LOG_FILE)
	@sleep $(WAIT_TIME)
	@OWNER_AT=$$($(SPL_BASE) address --token $$TOKEN --owner $(OWNER_ADDRESS) --verbose | grep -oP '(?<=Associated token address: ).*')
	@DEP_AT=$$($(SPL_BASE) address --token $$TOKEN --owner $(DEPLOYER_ADDRESS) --verbose | grep -oP '(?<=Associated token address: ).*')
	@echo ">> Transferring permissions for $$TOKEN" | tee -a $(LOG_FILE)
	@$(SPL_BASE) approve $$ACCT 0 $$DEP_AT   | tee -a $(LOG_FILE)
	@for auth in mint freeze close-mint metadata metadata-pointer; do \
		 target=$$( [ "$$auth" = mint -o "$$auth" = freeze ] && echo $(MINT_AND_BURN_ADDRESS) || echo $(OWNER_ADDRESS) ); \
		 echo "--> authorize $$auth -> $$target" | tee -a $(LOG_FILE); \
		 $(SPL_BASE) authorize $$TOKEN $$auth $$target | tee -a $(LOG_FILE); \
	 done
	@echo "--> revoke $$DEP_AT" | tee -a $(LOG_FILE)
	@$(SPL_BASE) revoke $$DEP_AT     | tee -a $(LOG_FILE)

# Minting also requires the CLI
mint-tokens: check-spl-cli
	@TOKEN=$$(cat $(ADDR_FILE))
	@echo "==> Minting 100,000 tokens to $$TOKEN" | tee -a $(LOG_FILE)
	@$(SPL_BASE) mint $$TOKEN 100000   | tee -a $(LOG_FILE)
	@echo "==> Displaying $$TOKEN after mint" | tee -a $(LOG_FILE)
	@$(SPL_BASE) display $$TOKEN       | tee -a $(LOG_FILE)

create-init-display: transfer-permissions
	@TOKEN=$$(cat $(ADDR_FILE))
	@echo "==> Displaying $$TOKEN" | tee -a $(LOG_FILE)
	@$(SPL_BASE) display $$TOKEN       | tee -a $(LOG_FILE)

create-token: create-init-display
	@echo "==> All done. Token deployed at $$(cat $(ADDR_FILE))"

