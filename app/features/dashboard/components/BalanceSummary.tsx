type BalanceSummaryProps = {
  currentBalanceDisplay: string;
  lastSyncedAt: number | null;
  isFetching: boolean;
  canRefresh: boolean;
  onRefresh: () => void | Promise<void>;
};

export function BalanceSummary({ currentBalanceDisplay, lastSyncedAt, isFetching, canRefresh, onRefresh }: BalanceSummaryProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div>
        <span className="text-xs uppercase text-slate-400">Tracked privacy cash balance</span>
        <p className="mt-2 text-4xl font-semibold">{currentBalanceDisplay}</p>
      </div>
      <div className="flex flex-col items-end gap-2 text-right text-xs text-slate-400">
        <span>Last sync: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Pending'}</span>
        <button
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
          onClick={onRefresh}
          disabled={!canRefresh || isFetching}
        >
          {isFetching ? 'Refreshing…' : 'Refresh balance'}
        </button>
      </div>
    </div>
  );
}

