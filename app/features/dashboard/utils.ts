import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function createId() {
  return Math.random().toString(36).slice(2);
}

export function formatSol(lamports: number) {
  return `${(lamports / LAMPORTS_PER_SOL).toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} SOL`;
}

export function formatShort(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function toAddressString(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof (value as { toBase58?: () => string }).toBase58 === 'function') {
    return (value as { toBase58(): string }).toBase58();
  }
  return null;
}

export function shortenAddress(value: string) {
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

