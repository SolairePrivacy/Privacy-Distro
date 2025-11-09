"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

type Recipient = { id: string; address: string; amount: number };
type ActivityEntry = { id: string; headline: string; detail: string; timestamp: number };
type LogEntry = { id: string; scope: string; message: string; timestamp: number };
type FlashEntry = { id: string; tone: 'positive' | 'negative'; message: string };

type PhantomEvent = 'connect' | 'disconnect' | 'accountChanged';
type PhantomEventHandler = (args: unknown) => void;
type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
  on?(event: PhantomEvent, handler: PhantomEventHandler): void;
  off?(event: PhantomEvent, handler: PhantomEventHandler): void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
}

type DepositApiResponse = { action: 'deposit'; tx: string; balanceLamports: number };
type WithdrawApiItem = { tx: string; recipient: string; lamports: number; feeLamports: number; isPartial: boolean };
type WithdrawApiResponse = { action: 'withdraw'; items: WithdrawApiItem[]; balanceLamports: number };
type BalanceApiResponse = { action: 'balance'; balanceLamports: number };

const DEFAULT_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const WALLET_STORAGE_KEY = 'private-pumper.wallet';
const FEE_BUFFER_LAMPORTS = 6_900_000;

function createId() {
  return Math.random().toString(36).slice(2);
}

function formatSol(lamports: number) {
  return `${(lamports / LAMPORTS_PER_SOL).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} SOL`;
}

function formatShort(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function toAddressString(value: unknown): string | null {
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

function shortenAddress(value: string) {
  if (value.length <= 8) {
    return value;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function callApi<T>(payload: Record<string, unknown>) {
  const response = await fetch('/api/private-cash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('Failed to reach the relay.');
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('Relay returned an invalid response.');
  }

  if (!response.ok) {
    const message = typeof (json as { error?: unknown })?.error === 'string' ? (json as { error: string }).error : 'Relay request failed.';
    throw new Error(message);
  }
  return json as T;
}

export default function Home() {
  const [ownerSecret, setOwnerSecret] = useState('');
  const [publicAddress, setPublicAddress] = useState('');
  const [balanceLamports, setBalanceLamports] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [depositInput, setDepositInput] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientAmount, setRecipientAmount] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [flash, setFlash] = useState<FlashEntry | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [phantomProvider, setPhantomProvider] = useState<PhantomProvider | null>(null);
  const [phantomAddress, setPhantomAddress] = useState('');
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { secret?: string; address?: string };
        if (parsed?.secret && parsed?.address) {
          setOwnerSecret(parsed.secret);
          setPublicAddress(parsed.address);
          return;
        }
      } catch {
        window.localStorage.removeItem(WALLET_STORAGE_KEY);
      }
    }
    const keypair = Keypair.generate();
    const secret = bs58.encode(keypair.secretKey);
    const address = keypair.publicKey.toBase58();
    window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ secret, address }));
    setOwnerSecret(secret);
    setPublicAddress(address);
  }, []);

  useEffect(() => {
    if (!ownerSecret || !publicAddress) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify({ secret: ownerSecret, address: publicAddress }));
  }, [ownerSecret, publicAddress]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  const pushLog = useCallback((scope: string, message: string) => {
    setLogs((existing) => [{ id: createId(), scope, message, timestamp: Date.now() }, ...existing].slice(0, 50));
  }, []);

  const showFlash = useCallback((message: string, tone: 'positive' | 'negative') => {
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    const entry: FlashEntry = { id: createId(), message, tone };
    setFlash(entry);
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlash((current) => (current?.id === entry.id ? null : current));
    }, 3200);
  }, []);

  const detectPhantomProvider = useCallback((): PhantomProvider | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    if (window.phantom?.solana?.isPhantom) {
      return window.phantom.solana;
    }
    if (window.solana?.isPhantom) {
      return window.solana;
    }
    return null;
  }, []);

  useEffect(() => {
    const provider = detectPhantomProvider();
    if (!provider) {
      return;
    }
    setPhantomProvider(provider);
    const currentAddress = provider.publicKey ? toAddressString(provider.publicKey) : null;
    if (currentAddress) {
      setPhantomAddress(currentAddress);
    }
    const handleAccountChanged = (value: unknown) => {
      const next = toAddressString(value) ?? '';
      setPhantomAddress(next);
      if (next) {
        pushLog('wallet', `Switched to ${next}`);
      } else {
        pushLog('wallet', 'Wallet disconnected.');
      }
    };
    provider.on?.('accountChanged', handleAccountChanged);
    return () => {
      provider.off?.('accountChanged', handleAccountChanged);
    };
  }, [detectPhantomProvider, pushLog]);

  const ensurePhantom = useCallback(async (): Promise<PhantomProvider | null> => {
    let provider = phantomProvider ?? detectPhantomProvider();
    if (!provider) {
      showFlash('Install the Phantom wallet extension to continue.', 'negative');
      return null;
    }
    setPhantomProvider(provider);
    const existingAddress = provider.publicKey ? toAddressString(provider.publicKey) : null;
    if (existingAddress) {
      setPhantomAddress(existingAddress);
      return provider;
    }
    setIsConnectingWallet(true);
    try {
      const result = await provider.connect();
      const key = result?.publicKey?.toBase58?.();
      if (!key) {
        throw new Error('Wallet connection failed.');
      }
      setPhantomAddress(key);
      showFlash('Wallet connected.', 'positive');
      pushLog('wallet', `Connected ${key}`);
      return provider;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed.';
      showFlash(message, 'negative');
      pushLog('wallet', message);
      return null;
    } finally {
      setIsConnectingWallet(false);
    }
  }, [phantomProvider, detectPhantomProvider, showFlash, pushLog]);

  const connectWallet = useCallback(async () => {
    await ensurePhantom();
  }, [ensurePhantom]);

  const totalQueuedLamports = useMemo(
    () => recipients.reduce((sum, recipient) => sum + Math.round(recipient.amount * LAMPORTS_PER_SOL), 0),
    [recipients]
  );

  const phantomDisplay = useMemo(
    () => (phantomAddress ? shortenAddress(phantomAddress) : 'Not connected'),
    [phantomAddress]
  );

  const currentBalanceDisplay = formatSol(balanceLamports);
  const queuedSolDisplay = formatShort(totalQueuedLamports / LAMPORTS_PER_SOL);

  const rpcUrl = DEFAULT_RPC;

  const refreshBalance = useCallback(
    async (silent = false) => {
      if (!ownerSecret) {
        return;
      }
      setIsFetchingBalance(true);
      try {
        const data = await callApi<BalanceApiResponse>({ action: 'balance', rpcUrl, owner: ownerSecret });
        setBalanceLamports(data.balanceLamports);
        setLastSyncedAt(Date.now());
        if (!silent) {
          showFlash('Balance refreshed.', 'positive');
        }
        pushLog('balance', 'Balance refreshed.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh balance.';
        if (!silent) {
          showFlash(message, 'negative');
        }
        pushLog('balance', message);
      } finally {
        setIsFetchingBalance(false);
      }
    },
    [ownerSecret, rpcUrl, showFlash, pushLog]
  );

  useEffect(() => {
    if (!ownerSecret) {
      return;
    }
    refreshBalance(true);
  }, [ownerSecret, refreshBalance]);

  const handleAddRecipient = useCallback(() => {
    const target = recipientAddress.trim();
    const amount = Number.parseFloat(recipientAmount);
    if (!target) {
      showFlash('Enter a destination wallet address.', 'negative');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showFlash('Recipient amount must be above zero.', 'negative');
      return;
    }
    setRecipients((existing) => [
      ...existing,
      {
        id: createId(),
        address: target,
        amount,
      },
    ]);
    setRecipientAddress('');
    setRecipientAmount('');
    showFlash('Recipient added to payout list.', 'positive');
  }, [recipientAddress, recipientAmount, showFlash]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients((existing) => existing.filter((entry) => entry.id !== id));
  }, []);

  const handleDeposit = useCallback(async () => {
    if (!ownerSecret || !publicAddress) {
      showFlash('Wallet not ready yet.', 'negative');
      return;
    }
    const amount = Number.parseFloat(depositInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      showFlash('Enter a deposit amount above zero.', 'negative');
      return;
    }
    const provider = await ensurePhantom();
    if (!provider) {
      return;
    }
    const senderAddress = provider.publicKey?.toBase58?.() ?? phantomAddress;
    if (!senderAddress) {
      showFlash('Wallet address unavailable.', 'negative');
      return;
    }
    const lamports = Math.round(amount * LAMPORTS_PER_SOL);
    const transferLamports = lamports + FEE_BUFFER_LAMPORTS;
    const connection = new Connection(rpcUrl, 'confirmed');
    const fromPubkey = new PublicKey(senderAddress);
    const toPubkey = new PublicKey(publicAddress);
    const availableLamports = await connection.getBalance(fromPubkey);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: fromPubkey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: transferLamports,
      })
    );
    const estimatedTxFee =
      (await connection.getFeeForMessage(transaction.compileMessage())).value ?? 5_000;
    const requiredLamports = transferLamports + estimatedTxFee;
    if (availableLamports < requiredLamports) {
      const shortfallLamports = requiredLamports - availableLamports;
      const shortfallSol = shortfallLamports / LAMPORTS_PER_SOL;
      showFlash(`Insufficient SOL in Phantom wallet. Add at least ${shortfallSol.toFixed(4)} SOL and retry.`, 'negative');
      pushLog('deposit', 'Not enough SOL in Phantom wallet for transfer and fees.');
      return;
    }
    setIsDepositing(true);
    pushLog('deposit', `Submitting deposit for ${amount} SOL.`);
    try {
      pushLog('deposit', `Requesting Phantom transfer of ${formatSol(transferLamports)} (includes fee buffer).`);
      const { signature } = await provider.signAndSendTransaction(transaction);
      pushLog('deposit', `Transfer signature ${signature}.`);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'finalized');
      pushLog('deposit', 'Transfer finalized on-chain.');
      const latestWalletAddress = provider.publicKey?.toBase58?.();
      if (latestWalletAddress) {
        setPhantomAddress(latestWalletAddress);
      }
      let settled = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const balance = await connection.getBalance(toPubkey);
        if (balance >= transferLamports) {
          settled = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!settled) {
        pushLog('deposit', 'Deposit wallet balance not yet reflecting transfer; retrying anyway.');
      }
      const data = await callApi<DepositApiResponse>({ action: 'deposit', rpcUrl, owner: ownerSecret, lamports });
      setBalanceLamports(data.balanceLamports);
      setLastSyncedAt(Date.now());
      setActivity((existing) => [
        {
          id: createId(),
          headline: 'Deposit completed',
          detail: `Transaction ${data.tx}`,
          timestamp: Date.now(),
        },
        ...existing,
      ]);
      setDepositInput('');
      showFlash('Deposit confirmed.', 'positive');
      pushLog('deposit', `Confirmed tx ${data.tx}.`);
    } catch (error) {
      const message =
        error instanceof Error && /Attempt to debit an account but found no record of a prior credit/i.test(error.message)
          ? 'Relayer could not see the funding transfer yet. Wait a few seconds and try again.'
          : error instanceof Error && /insufficient lamports/i.test(error.message)
            ? 'Not enough SOL was available for the transfer. Top up your Phantom wallet and try again.'
            : error instanceof Error
              ? error.message
              : 'Failed to submit deposit.';
      showFlash(message, 'negative');
      pushLog('deposit', message);
    } finally {
      setIsDepositing(false);
    }
  }, [ownerSecret, publicAddress, depositInput, ensurePhantom, phantomAddress, rpcUrl, showFlash, pushLog]);

  const handlePayout = useCallback(async () => {
    if (!ownerSecret) {
      showFlash('Wallet not ready yet.', 'negative');
      return;
    }
    if (!recipients.length) {
      showFlash('Add at least one payout before sending.', 'negative');
      return;
    }
    if (totalQueuedLamports <= 0) {
      showFlash('Queued payout amount must be greater than zero.', 'negative');
      return;
    }
    if (balanceLamports > 0 && totalQueuedLamports > balanceLamports) {
      showFlash('Queued payouts exceed tracked balance.', 'negative');
      return;
    }
    const payload = recipients.map((recipient) => ({
      address: recipient.address,
      lamports: Math.round(recipient.amount * LAMPORTS_PER_SOL),
    }));
    setIsWithdrawing(true);
    pushLog('withdraw', `Submitting ${payload.length} payout${payload.length === 1 ? '' : 's'}.`);
    try {
      const data = await callApi<WithdrawApiResponse>({ action: 'withdraw', rpcUrl, owner: ownerSecret, payouts: payload });
      setBalanceLamports(data.balanceLamports);
      setLastSyncedAt(Date.now());
      setRecipients([]);
      const entries = data.items.map<ActivityEntry>((item) => ({
        id: createId(),
        headline: `Sent ${formatSol(item.lamports)}`,
        detail: `Recipient ${item.recipient} • tx ${item.tx}`,
        timestamp: Date.now(),
      }));
      setActivity((existing) => [...entries, ...existing]);
      showFlash('Withdrawal batch completed.', 'positive');
      pushLog('withdraw', `Batch completed with ${data.items.length} transfer${data.items.length === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit withdrawals.';
      showFlash(message, 'negative');
      pushLog('withdraw', message);
    } finally {
      setIsWithdrawing(false);
    }
  }, [ownerSecret, recipients, totalQueuedLamports, balanceLamports, rpcUrl, showFlash, pushLog]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-2 text-center">
          <span className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Privacy Distro</span>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Route privacy cash with your own relay</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Generate a dedicated wallet, fund it, and let the backend relayer deposit into Privacy Cash and stream withdrawals to your payout list.
          </p>
        </header>

        {flash && (
          <div
            className={[
              'rounded-lg border px-4 py-3 text-sm',
              flash.tone === 'positive' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/40 bg-rose-500/10 text-rose-200',
            ].join(' ')}
          >
            {flash.message}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-6 rounded-2xl border border-white/5 bg-white/5 p-6 backdrop-blur">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm">
                <p className="text-xs uppercase text-slate-400">Deposit wallet</p>
                <p className="mt-2 break-all text-base font-semibold text-slate-100">{publicAddress || 'Loading...'}</p>
              </div>
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm">
                <p className="text-xs uppercase text-slate-400">Phantom wallet</p>
                <p className="mt-2 text-base font-semibold text-slate-100">{phantomDisplay}</p>
                {phantomAddress && <p className="mt-2 break-all text-[11px] text-slate-500">{phantomAddress}</p>}
                <button className="btn mt-3 w-full" onClick={connectWallet} disabled={isConnectingWallet}>
                  {isConnectingWallet ? 'Connecting…' : phantomAddress ? 'Reconnect wallet' : 'Connect Phantom'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <span className="text-xs uppercase text-slate-400">Tracked privacy cash balance</span>
                <p className="mt-2 text-4xl font-semibold">{currentBalanceDisplay}</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right text-xs text-slate-400">
                <span>Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Pending'}</span>
                <button
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
                  onClick={() => refreshBalance(false)}
                  disabled={isFetchingBalance || !ownerSecret}
                >
                  {isFetchingBalance ? 'Refreshing…' : 'Refresh balance'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5">
              <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto] md:items-end">
                <label className="grid gap-2 text-sm">
                  <span className="text-slate-400">Deposit amount (SOL)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={depositInput}
                    onChange={(event) => setDepositInput(event.target.value)}
                    disabled={isDepositing}
                  />
                </label>
                <button
                  className="btn md:h-12"
                  onClick={handleDeposit}
                  disabled={isDepositing || isConnectingWallet || !ownerSecret || !publicAddress}
                >
                  {isDepositing ? 'Depositing…' : 'Deposit to Privacy Cash'}
                </button>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
                  Queued payouts: <span className="font-medium text-slate-100">{queuedSolDisplay} SOL</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Each Phantom transfer includes an additional 0.001 SOL buffer so the deposit wallet can pay relayer fees.
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/40">
              <div className="border-b border-white/5 px-5 py-4 text-sm font-medium uppercase tracking-widest text-slate-400">
                Payout builder
              </div>
              <div className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-[1.7fr_0.8fr_auto]">
                  <input
                    className="input"
                    placeholder="Destination wallet address"
                    value={recipientAddress}
                    onChange={(event) => setRecipientAddress(event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Amount (SOL)"
                    inputMode="decimal"
                    value={recipientAmount}
                    onChange={(event) => setRecipientAmount(event.target.value)}
                  />
                  <button className="btn md:h-12" onClick={handleAddRecipient}>
                    Add wallet
                  </button>
                </div>
                <div className="space-y-2">
                  {recipients.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                      No payouts prepared yet.
                    </div>
                  )}
                  {recipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-100">{recipient.address}</p>
                        <span className="text-xs uppercase tracking-wide text-slate-500">{formatShort(recipient.amount)} SOL</span>
                      </div>
                      <button
                        className="rounded-md border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/10"
                        onClick={() => removeRecipient(recipient.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button className="btn w-full" onClick={handlePayout} disabled={isWithdrawing || recipients.length === 0}>
                  {isWithdrawing ? 'Processing…' : `Send ${recipients.length || ''} ${recipients.length === 1 ? 'payout' : 'payouts'}`}
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">Activity</h2>
              {activity.length === 0 && <p className="mt-2 text-sm text-slate-400">No transactions yet.</p>}
              <ul className="mt-4 space-y-3">
                {activity.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                    <p className="font-medium text-slate-100">{entry.headline}</p>
                    <p className="text-xs text-slate-500">{entry.detail}</p>
                    <span className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur max-w-xl w-full">
              <h2 className="text-lg font-semibold">Relay log</h2>
              {logs.length === 0 && <p className="mt-2 text-sm text-slate-400">Awaiting activity.</p>}
              <ul className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
                {logs.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
                    <p className="font-semibold text-slate-200">{entry.scope}</p>
                    <p className="mt-1 text-slate-300">{entry.message}</p>
                    <span className="mt-1 block text-[11px]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
