.PHONY: create-token use-token

TOKEN_NAME := 'ZARP Stablecoin'
TOKEN_SYMBOL := 'ZARP'
TOKEN_URI := 'https://raw.githubusercontent.com/venox-digital-assets/zarp.contract/main/public/sol-metadata.json'

CREATE_TOKEN_DIR := .create-token
LOG_FILE := $(CREATE_TOKEN_DIR)/create-token-output.log
ADDRESS_FILE := $(CREATE_TOKEN_DIR)/token_address.txt
ACCOUNT_ADDRESS_FILE := $(CREATE_TOKEN_DIR)/account_address.txt


check-vars:
ifndef DEPLOYER_ADDRESS
	$(error DEPLOYER_ADDRESS is required, but undefined. Set with `export DEPLOYER_ADDRESS=0x0`)
endif
ifndef MINT_AND_BURN_ADDRESS
	$(error MINT_AND_BURN_ADDRESS is required, but undefined. Set with `export MINT_AND_BURN_ADDRESS=0x0`)
endif
ifndef OWNER_ADDRESS
	$(error OWNER_ADDRESS is required, but undefined. Set with `export OWNER_ADDRESS=0x0`)
endif

create-base: confirm check-vars
	@mkdir -p $(CREATE_TOKEN_DIR)
	@{ \
		echo "Creating base token..." > $(LOG_FILE); \
		echo "Executing: spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb create-token --decimals 6 --default-account-state initialized --enable-confidential-transfers manual --enable-metadata --enable-freeze  --enable-close" | tee -a $(LOG_FILE); \
		TOKEN_OUTPUT=$$(spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb create-token --decimals 6 --default-account-state initialized --enable-confidential-transfers manual --enable-metadata --enable-freeze  --enable-close); \
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
			echo "Creating accounts for token: $(TOKEN_ADDRESS)..."; \
			echo "Executing: spl-token create-account $(TOKEN_ADDRESS)"; \
			ACCOUNT_OUTPUT=$$(spl-token create-account $(TOKEN_ADDRESS));\
			echo "$$ACCOUNT_OUTPUT" | tee -a $(LOG_FILE); \
			ACCOUNT_ADDRESS=$$(echo "$$ACCOUNT_OUTPUT" | grep 'Creating account ' | awk '{print $$3}'); \
			echo "$$ACCOUNT_OUTPUT" | grep 'Creating account '; \
			echo $$ACCOUNT_ADDRESS > $(ACCOUNT_ADDRESS_FILE); \
			echo "Created account with address: $$ACCOUNT_ADDRESS"; \
			# echo "Creating Mint And Burn Account: spl-token create-account $(TOKEN_ADDRESS) --owner $(MINT_AND_BURN_ADDRESS) --fee-payer ~/.config/solana/id.json"; \
			# spl-token create-account $(TOKEN_ADDRESS) --owner $(MINT_AND_BURN_ADDRESS) --fee-payer ~/.config/solana/id.json; \
	} 2>&1 | tee -a $(LOG_FILE)
	$(eval export ACCOUNT_ADDRESS=$(shell grep 'Created account with address' $(LOG_FILE) | awk '{print $$6}'))

transfer-permissions: create-account
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	$(eval ACCOUNT_ADDRESS=$(shell cat $(ACCOUNT_ADDRESS_FILE)))
	$(eval OWNER_ATOKEN_ADDRESS=$(shell spl-token address --token $(TOKEN_ADDRESS) --owner $(OWNER_ADDRESS) --verbose | grep -oP '(?<=Associated token address: ).*'))
	$(eval DEPLOYER_ATOKEN_ADDRESS=$(shell spl-token address --token $(TOKEN_ADDRESS) --owner $(DEPLOYER_ADDRESS) --verbose | grep -oP '(?<=Associated token address: ).*'))
	@{ \
			echo "Transferring permissions for token: $(TOKEN_ADDRESS) to $(OWNER_ADDRESS)'s associated token account: $(OWNER_ATOKEN_ADDRESS)..."; \
			echo "Executing: spl-token approve $(ACCOUNT_ADDRESS) 0 $(DEPLOYER_ATOKEN_ADDRESS)"; \
			spl-token approve $(ACCOUNT_ADDRESS) 0 $(DEPLOYER_ATOKEN_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) mint $(MINT_AND_BURN_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) mint $(MINT_AND_BURN_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) freeze $(MINT_AND_BURN_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) freeze $(MINT_AND_BURN_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) close-mint $(OWNER_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) close-mint $(OWNER_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) confidential-transfer-mint $(OWNER_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) confidential-transfer-mint $(OWNER_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) metadata $(OWNER_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) metadata $(OWNER_ADDRESS); \
			echo "Executing: spl-token authorize $(TOKEN_ADDRESS) metadata-pointer $(OWNER_ADDRESS)"; \
			spl-token authorize $(TOKEN_ADDRESS) metadata-pointer $(OWNER_ADDRESS); \
			echo ""; \
			echo "Revoking permissions for token: $(TOKEN_ADDRESS) from $(DEPLOYER_ADDRESS)..."; \
			spl-token revoke $(DEPLOYER_ATOKEN_ADDRESS); \
	} 2>&1 | tee -a $(LOG_FILE)
	@echo "Transferred permissions for token: $(TOKEN_ADDRESS) to $(OWNER_ADDRESS)'s associated token account: $(OWNER_ATOKEN_ADDRESS)"

mint-tokens: 
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Minting tokens to the account..."; \
		echo "Executing: spl-token mint $(TOKEN_ADDRESS) 100000"; \
		spl-token mint $(TOKEN_ADDRESS) 100000; \
	} 2>&1 | tee -a $(LOG_FILE)

create-init-display: transfer-permissions
	$(eval TOKEN_ADDRESS=$(shell cat $(ADDRESS_FILE)))
	@{ \
		echo "Displaying token: $(TOKEN_ADDRESS)..."; \
		echo "Executing: spl-token display $(TOKEN_ADDRESS)"; \
		spl-token display $(TOKEN_ADDRESS); \
	} 2>&1 | tee -a $(LOG_FILE)

create-token: create-init-display
	@echo "FIN."

confirm: check-vars
	@{ \
		echo "-------------------------------"; \
		echo "Active Solana config"; \
		echo "-------------------------------"; \
		solana config get; \
		echo "-------------------------------"; \
		echo "Active Variables"; \
		echo "-------------------------------"; \
		echo "MINT_AND_BURN_ADDRESS=$(MINT_AND_BURN_ADDRESS)"; \
		echo "OWNER_ADDRESS=$(OWNER_ADDRESS)"; \
		echo "-------------------------------"; \
		echo ""; \
		echo "NB: PLEASE MAKE SURE THESE ARE CORRECT!"; \
		echo ""; \
		echo "-------------------------------"; \
	} 2>&1 | tee -a $(LOG_FILE)
	@echo -n "Are you sure? [y/N] " && read ans && [ $${ans:-N} = y ]

local-sol: 
	@echo "Starting local solana validator..."
	solana-test-validator

	