type DepositFormProps = {
  depositInput: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  isDepositing: boolean;
  isConnectingWallet: boolean;
  canSubmit: boolean;
  queuedSolDisplay: string;
};

export function DepositForm({
  depositInput,
  onChange,
  onSubmit,
  isDepositing,
  isConnectingWallet,
  canSubmit,
  queuedSolDisplay,
}: DepositFormProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5">
      <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto] md:items-end">
        <label className="grid gap-2 text-sm">
          <span className="text-slate-400">Deposit amount (SOL)</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            value={depositInput}
            onChange={(event) => onChange(event.target.value)}
            disabled={isDepositing}
          />
        </label>
        <button className="btn md:h-12" onClick={onSubmit} disabled={isDepositing || isConnectingWallet || !canSubmit}>
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
  );
}

