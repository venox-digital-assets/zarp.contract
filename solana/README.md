# Solana

The Solana version of ZARP is created using the SPL Token Program CLI (with some of the Token-2020 program extrensions).This is wrapped into the Makefile:

## Install

Install Local Dev Solana Environment from here: <https://docs.solana.com/getstarted/local>
Then also create a wallet and airdrop as per the instructions above. Something like:

```sh
solana config set --url localhost
solana config get
solana-keygen new
solana config set -k ~/.config/solana/id.json
solana airdrop 2
solana balance
solana address 
# You will need the address later
```

## Local

To create the token against the local validator:

```sh
# Run the local test chain:
make local-sol

# In seperate terminal, ensure we're pointing to the local validator and create the token:
solana config set --url localhost
# Replace the address below with the local address from `solana address`
export MINT_AND_BURN_ADDRESS=0x0
make create-token

# The created token address is saved in:
cat .create-token/token_address.txt

# The logs are saved in:
cat .create-token/create-token-output.log

```

## Devnet

This command _should_ airdrop correctly for Devnet, but mine kept failing with error: ``

```sh
solana config set --url https://api.devnet.solana.com
solana airdrop 1 --url devnet

```

## Known issues

- If you want to use a Hardware wallet via WSL2, you need to attach it using: https://learn.microsoft.com/en-us/windows/wsl/connect-usb 

Windows Terminal (Administrator)
```sh
usbipd list
usbipd bind --busid <busid>
usbipd attach --wsl --busid <busid>
```

WSL2 (Ubuntu):
```sh
lsusb
```


- Sometimes `solana-test-validator` fails to start after install if you don't have bzip2: `sudo apt-get install bzip2`, or check the logs: `tail ./test-ledger/validator.log`

Fauceting on Devnet was actually a nightmare. Kept failing on all Web faucets as well. Finally one of the following worked:

- <https://faucet.solana.com/>
- <https://faucet.quicknode.com/solana/devnet>

