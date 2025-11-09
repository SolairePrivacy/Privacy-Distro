"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { callPrivacyCashApi } from './features/dashboard/api';
import { DEFAULT_RPC, FEE_BUFFER_LAMPORTS, WALLET_STORAGE_KEY } from './features/dashboard/constants';
import type {
  ActivityEntry,
  BalanceApiResponse,
  DepositApiResponse,
  FlashEntry,
  LogEntry,
  PhantomProvider,
  Recipient,
  WithdrawApiResponse,
} from './features/dashboard/types';
import { createId, formatShort, formatSol, shortenAddress, toAddressString } from './features/dashboard/utils';
import { FlashBanner } from './features/dashboard/components/FlashBanner';
import { WalletOverview } from './features/dashboard/components/WalletOverview';
import { BalanceSummary } from './features/dashboard/components/BalanceSummary';
import { DepositForm } from './features/dashboard/components/DepositForm';
import { PayoutBuilder } from './features/dashboard/components/PayoutBuilder';
import { ActivityList } from './features/dashboard/components/ActivityList';
import { LogList } from './features/dashboard/components/LogList';

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  }
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
  const canRefreshBalance = Boolean(ownerSecret);
  const canDeposit = Boolean(ownerSecret && publicAddress);

  const rpcUrl = DEFAULT_RPC;

  const refreshBalance = useCallback(
    async (silent = false) => {
      if (!ownerSecret) {
        return;
      }
      setIsFetchingBalance(true);
      try {
        const data = await callPrivacyCashApi<BalanceApiResponse>({ action: 'balance', rpcUrl, owner: ownerSecret });
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
      const data = await callPrivacyCashApi<DepositApiResponse>({ action: 'deposit', rpcUrl, owner: ownerSecret, lamports });
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
      const data = await callPrivacyCashApi<WithdrawApiResponse>({ action: 'withdraw', rpcUrl, owner: ownerSecret, payouts: payload });
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

        <FlashBanner flash={flash} />

        <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-6 rounded-2xl border border-white/5 bg-white/5 p-6 backdrop-blur">
            <WalletOverview
              depositAddress={publicAddress}
              phantomDisplay={phantomDisplay}
              phantomAddress={phantomAddress}
              isConnecting={isConnectingWallet}
              onConnectWallet={connectWallet}
            />

            <BalanceSummary
              currentBalanceDisplay={currentBalanceDisplay}
              lastSyncedAt={lastSyncedAt}
              isFetching={isFetchingBalance}
              canRefresh={canRefreshBalance}
              onRefresh={() => refreshBalance(false)}
            />

            <DepositForm
              depositInput={depositInput}
              onChange={(value) => setDepositInput(value)}
              onSubmit={handleDeposit}
              isDepositing={isDepositing}
              isConnectingWallet={isConnectingWallet}
              canSubmit={canDeposit}
              queuedSolDisplay={queuedSolDisplay}
            />

            <PayoutBuilder
              recipientAddress={recipientAddress}
              onRecipientAddressChange={(value) => setRecipientAddress(value)}
              recipientAmount={recipientAmount}
              onRecipientAmountChange={(value) => setRecipientAmount(value)}
              recipients={recipients}
              onAddRecipient={handleAddRecipient}
              onRemoveRecipient={removeRecipient}
              onSubmit={handlePayout}
              isProcessing={isWithdrawing}
            />
          </div>

          <aside className="space-y-4">
            <ActivityList entries={activity} />
            <LogList entries={logs} />
          </aside>
        </section>
      </div>
    </main>
  );
}
