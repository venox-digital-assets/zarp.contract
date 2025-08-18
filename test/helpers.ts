// Shared test helpers

/**
 * Compare two Ethereum addresses case-insensitively after trimming.
 * Returns false if either is missing or not a 0x-prefixed string.
 */
export function isCanonicalAddressEqual(a?: string, b?: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na.startsWith('0x') || !nb.startsWith('0x')) return false;
  return na === nb;
}

// --- Typed helpers for OZ upgrades plugin (ethers v6) ---
// Centralize the unavoidable cast so individual tests don't need `as unknown as ...`.
import { ethers, upgrades } from 'hardhat';

/**
 * Deploy a proxy from a given factory and return a strongly typed contract instance.
 */
export async function deployProxyFromFactoryTyped<T>(Factory: any): Promise<T> {
  const proxy = await upgrades.deployProxy(Factory);
  // Ensure deployment is mined before returning
  // @ts-ignore waitForDeployment exists on ethers v6 Contract objects
  if (typeof proxy.waitForDeployment === 'function') {
    await proxy.waitForDeployment();
  }
  return proxy as unknown as T;
}

/**
 * Upgrade a proxy at `address` using a given factory, returning a typed instance.
 */
export async function upgradeProxyTyped<T>(address: string, Factory: any): Promise<T> {
  const upgraded = await upgrades.upgradeProxy(address, Factory);
  // @ts-ignore ethers v6
  if (typeof upgraded.waitForDeployment === 'function') {
    await upgraded.waitForDeployment();
  }
  return upgraded as unknown as T;
}
