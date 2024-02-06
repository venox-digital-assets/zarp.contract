.PHONY: create-token use-token

TOKEN_NAME := 'ZARP Stablecoin'
TOKEN_SYMBOL := 'ZARP'
TOKEN_URI := 'https://raw.githubusercontent.com/venox-digital-assets/zarp.contract/feature/solana/public/sol-metadata.json'

CREATE_TOKEN_DIR := .create-token
LOG_FILE := $(CREATE_TOKEN_DIR)/create-token-output.log
ADDRESS_FILE := $(CREATE_TOKEN_DIR)/token_address.txt

create-base:
	@mkdir -p $(CREATE_TOKEN_DIR)
	@{ \
		echo "Creating base token..." > $(LOG_FILE); \
		echo "Executing: spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb create-token --enable-metadata --enable-freeze" | tee -a $(LOG_FILE); \
		TOKEN_OUTPUT=$$(spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb create-token --enable-metadata --enable-freeze); \
		echo "$$TOKEN_OUTPUT" | tee -a $(LOG_FILE); \
		TOKEN_ADDRESS=$$(echo "$$TOKEN_OUTPUT" | grep 'Address:' | awk '{print $$2}'); \
		echo $$TOKEN_ADDRESS > $(ADDRESS_FILE); \
		echo "Token Address: $$TOKEN_ADDRESS"; \
	} 

initialize-metadata: create-base
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Updating metadata for token: $(TOKEN_ADDRESS)..."; \
		echo "Executing: spl-token initialize-metadata $(TOKEN_ADDRESS) $(TOKEN_NAME) $(TOKEN_SYMBOL) $(TOKEN_URI)"; \
		spl-token initialize-metadata $(TOKEN_ADDRESS) $(TOKEN_NAME) $(TOKEN_SYMBOL) $(TOKEN_URI); \
	} 2>&1 | tee -a $(LOG_FILE)

create-account: initialize-metadata
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Creating account for token: $(TOKEN_ADDRESS)..."; \
		echo "Executing: spl-token create-account $(TOKEN_ADDRESS)"; \
		spl-token create-account $(TOKEN_ADDRESS); \
	} 2>&1 | tee -a $(LOG_FILE)
	$(eval export ACCOUNT_ADDRESS=$(shell grep 'Creating account ' $(LOG_FILE) | awk '{print $$3}' | tail -n 1))
	@echo "Created account with address: $(ACCOUNT_ADDRESS)"

mint-tokens: create-account
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Minting tokens to the account..."; \
		echo "Executing: spl-token mint $(TOKEN_ADDRESS) 100000"; \
		spl-token mint $(TOKEN_ADDRESS) 100000; \
	} 2>&1 | tee -a $(LOG_FILE)

create-init-display: mint-tokens
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Displaying token: $(TOKEN_ADDRESS)..."; \
		echo "Executing: spl-token display $(TOKEN_ADDRESS)"; \
		spl-token display $(TOKEN_ADDRESS); \
	} 2>&1 | tee -a $(LOG_FILE)

create-token: create-init-display
	@echo "FIN."

local-sol:
	@echo "Starting local solana validator..."
	solana-test-validator