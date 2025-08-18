import fs from 'fs';
import path from 'path';

/**
 * Write a JSON snapshot under deployments/records/<network>/<YYYY-MM-DD>/<timestamp>-<label>.json
 * Directories are created if missing. Returns absolute file path.
 */
export function writeArchive(network: string, label: string, data: any): string {
  const base = path.join(process.cwd(), 'deployments', 'records', network);
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const dayDir = path.join(base, ymd);
  if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = path.join(dayDir, `${ts}-${safe}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
