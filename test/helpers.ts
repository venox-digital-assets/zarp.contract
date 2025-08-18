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
