type WalletOverviewProps = {
  depositAddress: string;
  phantomDisplay: string;
  phantomAddress: string;
  isConnecting: boolean;
  onConnectWallet: () => void | Promise<void>;
};

export function WalletOverview({
  depositAddress,
  phantomDisplay,
  phantomAddress,
  isConnecting,
  onConnectWallet,
}: WalletOverviewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm">
        <p className="text-xs uppercase text-slate-400">Deposit wallet</p>
        <p className="mt-2 break-all text-base font-semibold text-slate-100">{depositAddress || 'Loading...'}</p>
      </div>
      <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 p-4 text-sm">
        <p className="text-xs uppercase text-slate-400">Phantom wallet</p>
        <p className="mt-2 text-base font-semibold text-slate-100">{phantomDisplay}</p>
        {phantomAddress && <p className="mt-2 break-all text-[11px] text-slate-500">{phantomAddress}</p>}
        <button className="btn mt-3 w-full" onClick={onConnectWallet} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : phantomAddress ? 'Reconnect wallet' : 'Connect Phantom'}
        </button>
      </div>
    </div>
  );
}

