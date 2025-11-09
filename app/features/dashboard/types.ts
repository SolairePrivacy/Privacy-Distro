import type { Transaction } from '@solana/web3.js';

export type Recipient = {
  id: string;
  address: string;
  amount: number;
};

export type ActivityEntry = {
  id: string;
  headline: string;
  detail: string;
  timestamp: number;
};

export type LogEntry = {
  id: string;
  scope: string;
  message: string;
  timestamp: number;
};

export type FlashEntry = {
  id: string;
  tone: 'positive' | 'negative';
  message: string;
};

export type PhantomEvent = 'connect' | 'disconnect' | 'accountChanged';

export type PhantomEventHandler = (args: unknown) => void;

export type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
  on?(event: PhantomEvent, handler: PhantomEventHandler): void;
  off?(event: PhantomEvent, handler: PhantomEventHandler): void;
};

export type DepositApiResponse = {
  action: 'deposit';
  tx: string;
  balanceLamports: number;
};

export type WithdrawApiItem = {
  tx: string;
  recipient: string;
  lamports: number;
  feeLamports: number;
  isPartial: boolean;
};

export type WithdrawApiResponse = {
  action: 'withdraw';
  items: WithdrawApiItem[];
  balanceLamports: number;
};

export type BalanceApiResponse = {
  action: 'balance';
  balanceLamports: number;
};

