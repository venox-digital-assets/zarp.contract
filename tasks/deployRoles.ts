import { task } from 'hardhat/config';
import { deployAndConfigure } from '../scripts/lib/deployShared';
import { writeArchive } from './archiveUtil';
import fs from 'fs';
import path from 'path';
import { expectedCanonicalProxy } from './canonicalProxies';

/*
Hardhat task: deploy:roles
Deploys the Zarp proxy, optionally granting roles to provided addresses and optionally renouncing them from the deployer.

Usage:
  yarn hardhat deploy:roles \
    --minter 0x... --verifier 0x... --burner 0x... --pauser 0x... --upgrader 0x... --renounce

Network selection (example sepolia):
  yarn hardhat deploy:roles --network sepolia --upgrader 0xSafe --minter 0xMinter

Skip granting (just deploy):
  yarn hardhat deploy:roles --no-grant
*/

task('deploy:roles', 'Deploy Zarp proxy with role distribution (parity with scripts/Deploy.ts)')
  .addOptionalParam('minter', 'Address for MINTER_ROLE')
  .addOptionalParam('verifier', 'Address for VERIFIER_ROLE')
  .addOptionalParam('burner', 'Address for BURNER_ROLE')
  .addOptionalParam('pauser', 'Address for PAUSER_ROLE')
  .addOptionalParam('upgrader', 'Address for UPGRADER_ROLE')
  .addOptionalParam('admin', 'Address for DEFAULT_ADMIN_ROLE (new admin)')
  .addFlag('renounce', 'Renounce each granted role from deployer after granting')
  .addFlag('renounceAdmin', 'Renounce only DEFAULT_ADMIN_ROLE from deployer (requires --admin)')
  .addFlag('noGrant', 'Skip granting any roles (just deploy)')
  .addFlag('quiet', 'Suppress role summary output')
  .addFlag('json', 'Emit JSON summary object as last line')
  .addFlag('allowNoncanonical', 'Allow non-canonical proxy address (local networks only)')
  .addFlag('allowNonceDrift', 'Allow deployer nonce to be non-zero on unregistered network (NOT RECOMMENDED)')
  .addFlag('noStatus', 'Skip automatic post-deploy status output')
  .addFlag('archive', 'Persist deployment summary JSON under deployments/records/<network>/')
  .setAction(async (args, hre) => {
    const {
      minter,
      verifier,
      burner,
      pauser,
      upgrader,
      admin,
      renounce,
      renounceAdmin,
      noGrant,
      quiet,
      json,
      allowNoncanonical,
      allowNonceDrift,
      noStatus,
      archive,
    } = args;
    if (renounceAdmin && !admin) {
      throw new Error('--renounce-admin requires specifying a replacement admin via --admin <address>');
    }
    // Nonce / canonical guard: for known networks with registered canonical proxy, refuse redeploy mismatch.
    // Robust chainId resolution (Hardhat sometimes leaves network.config.chainId undefined for localhost)
    let chainId = hre.network.config.chainId as number | undefined;
    if (!chainId) {
      try {
        const net = await hre.ethers.provider.getNetwork();
        chainId = Number(net.chainId.toString());
      } catch {
        chainId = undefined;
      }
    }
    const registryExpected = chainId !== undefined ? expectedCanonicalProxy(chainId) : undefined;
    const signer = (await hre.ethers.getSigners())[0];
    const currentNonce = await hre.ethers.provider.getTransactionCount(await signer.getAddress());
    if (!registryExpected) {
      // New network path: enforce first-use nonce discipline unless override
      if (currentNonce !== 0 && !allowNonceDrift) {
        const cidMsg = chainId !== undefined ? `chainId ${chainId}` : 'unknown chainId';
        const localHint =
          hre.network.name === 'hardhat' || hre.network.name === 'localhost'
            ? ' (expected after first local deploy; this guard just demonstrates nonce discipline)'
            : '';
        throw new Error(
          `Deployer nonce ${currentNonce} != 0 on unregistered network (${cidMsg})${localHint}. Use a fresh deployer (or pass --allow-nonce-drift) to preserve global address uniformity.`,
        );
      }
    } else {
      // Existing network: ensure code exists at registry address; block accidental second deploy.
      const code = await hre.ethers.provider.getCode(registryExpected);
      if (code && code !== '0x') {
        throw new Error(`Canonical proxy already deployed at ${registryExpected} (chainId ${chainId}); aborting duplicate deploy.`);
      } else {
        // Edge: registry expects address but code absent (disaster recovery scenario) -> allow only if nonce==0 to keep address
        if (currentNonce !== 0) {
          throw new Error(
            `Recovery deploy requires deployer nonce 0 to recreate canonical address ${registryExpected}; current nonce=${currentNonce}`,
          );
        }
      }
    }

    const res = await deployAndConfigure(
      hre,
      { minter, verifier, burner, pauser, upgrader, admin },
      {
        grant: !noGrant,
        renounceAll: !!renounce,
        renounceAdminOnly: !!renounceAdmin,
        summary: !quiet,
        allowNonCanonical: !!allowNoncanonical,
      },
    );
    // Persist deployment info for non-ephemeral networks (helps auto-detect later flows)
    const CANONICAL_PROXY_GLOBAL = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';
    const CANONICAL_PROXY_LOCAL = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    const isLocal = hre.network.name === 'hardhat' || hre.network.name === 'localhost';
    const expectedCanonical = isLocal ? CANONICAL_PROXY_LOCAL : registryExpected || CANONICAL_PROXY_GLOBAL;
    // Persist only for non-ephemeral networks (skip hardhat & localhost to avoid polluting repo with transient data)
    if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
      const outDir = path.join(process.cwd(), 'deployments');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
      const file = path.join(outDir, `${hre.network.name}.zarp.json`);
      const record = {
        network: hre.network.name,
        proxy: res.proxyAddress,
        implementation: res.implementationAddress,
        deployer: res.deployer,
        timestamp: new Date().toISOString(),
        granted: { admin, minter, verifier, burner, pauser, upgrader },
        renounced: !!renounce || !!renounceAdmin,
      };
      if (res.proxyAddress.toLowerCase() !== expectedCanonical.toLowerCase()) {
        if (!(isLocal && allowNoncanonical)) {
          throw new Error(`Refusing to write deployment record: proxy ${res.proxyAddress} != canonical ${expectedCanonical}`);
        }
      }
      fs.writeFileSync(file, JSON.stringify(record, null, 2));
      if (!quiet) console.log(`Saved deployment record -> ${file}`);
    }
    const summaryObj = {
      proxy: res.proxyAddress,
      implementation: res.implementationAddress,
      deployer: res.deployer,
      network: hre.network.name,
      granted: { admin, minter, verifier, burner, pauser, upgrader },
      renounced: !!renounce || !!renounceAdmin,
    };
    if (archive) {
      try {
        const file = writeArchive(hre.network.name, 'deploy', summaryObj);
        if (!quiet) console.log(`Archived deployment -> ${file}`);
      } catch (e: any) {
        console.warn(`Archive failed: ${e?.message || e}`);
      }
    }
    if (json) console.log(JSON.stringify(summaryObj));
    console.log('Deployment complete (deploy:roles).');
    if (!noStatus) {
      try {
        const addrs: string[] = [];
        for (const a of [admin, minter, verifier, burner, pauser, upgrader]) {
          if (a && /^0x[0-9a-fA-F]{40}$/.test(a)) addrs.push(a);
        }
        await hre.run('zarp:status', { proxy: 'auto', address: addrs, json: !!json, archive });
      } catch (e: any) {
        console.warn(`Post-deploy status failed: ${e?.message || e}`);
      }
    }
  });
