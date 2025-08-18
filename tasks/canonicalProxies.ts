// Canonical proxy registry: chainId -> proxy address
// Grandfathered canonical proxy address used across existing deployed networks.
// This is the canonical proxy address used across multiple networks.
// Changing this address requires governance approval, as it may affect deployed
// contracts and integrations. DO NOT mutate past entries without governance sign-off.

export const CANONICAL_PROXY_ADDRESS = '0xb755506531786C8aC63B756BaB1ac387bACB0C04';

export const canonicalProxies: Record<number, string> = {
  1: CANONICAL_PROXY_ADDRESS, // Ethereum Mainnet
  137: CANONICAL_PROXY_ADDRESS, // Polygon
  80002: CANONICAL_PROXY_ADDRESS, // Polygon Amoy testnet
  8453: CANONICAL_PROXY_ADDRESS, // Base
  84532: CANONICAL_PROXY_ADDRESS, // Base Sepolia testnet
  11155111: CANONICAL_PROXY_ADDRESS, // Sepolia
  100: CANONICAL_PROXY_ADDRESS, // Gnosis Chain
  10200: CANONICAL_PROXY_ADDRESS, // Gnosis Chiado testnet
};

export function expectedCanonicalProxy(chainId: number): string | undefined {
  return canonicalProxies[chainId];
}
