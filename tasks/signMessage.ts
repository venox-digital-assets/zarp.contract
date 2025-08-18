import { task } from 'hardhat/config';
import { Wallet, verifyMessage } from 'ethers';
import fs from 'fs';
import path from 'path';

/*
Task: zarp:sign-message
Signs a message with a private key from env (default DEPLOYER_PRIVATE_KEY) and prints JSON.
Params:
  --message "..."         Direct message to sign
  --file <path>           Read message from file
  --trim                  Trim trailing newlines when reading from file
  --env <VAR>             Env var that holds the private key (default DEPLOYER_PRIVATE_KEY)
  --json                  JSON output (default true)
Usage:
  yarn hardhat zarp:sign-message --message "text" --env DEPLOYER_PRIVATE_KEY
  yarn hardhat zarp:sign-message --file msg.txt --trim
*/

task('zarp:sign-message', 'Sign a message using a private key from environment')
  .addOptionalParam('message', 'Message text to sign')
  .addOptionalParam('file', 'Path to file containing message')
  .addOptionalParam('env', 'Env var name of private key', 'DEPLOYER_PRIVATE_KEY')
  .addFlag('trim', 'Trim trailing newline when reading from file')
  .addFlag('json', 'Emit JSON output (default)')
  .setAction(async (args, hre) => {
    const { message, file, env, trim, json } = args as { message?: string; file?: string; env: string; trim?: boolean; json?: boolean };

    let msg = message;
    if (!msg && file) {
      const p = path.resolve(process.cwd(), file);
      msg = fs.readFileSync(p, 'utf8');
      if (trim) msg = msg.replace(/[\r\n]+$/g, '');
    }
    if (!msg) throw new Error('Provide --message "..." or --file <path>');

    const pk = process.env[env];
    if (!pk) throw new Error(`Env var ${env} is not set`);

    const wallet = new Wallet(pk);
    const signature = await wallet.signMessage(msg);
    const recovered = verifyMessage(msg, signature);
    const out = {
      address: wallet.address,
      env,
      message: msg,
      signature,
      recovered,
      match: recovered.toLowerCase() === wallet.address.toLowerCase(),
    };

    if (json || !process.stdout.isTTY) {
      console.log(JSON.stringify(out));
    } else {
      console.log('Address:', wallet.address);
      console.log('Signature:', signature);
      console.log('Recovered:', recovered);
      console.log('Match:', out.match);
    }
  });
