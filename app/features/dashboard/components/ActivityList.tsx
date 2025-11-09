import type { ActivityEntry } from '../types';

type ActivityListProps = {
  entries: ActivityEntry[];
};

export function ActivityList({ entries }: ActivityListProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur">
      <h2 className="text-lg font-semibold">Activity</h2>
      {entries.length === 0 && <p className="mt-2 text-sm text-slate-400">No transactions yet.</p>}
      <ul className="mt-4 space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
            <p className="font-medium text-slate-100">{entry.headline}</p>
            <p className="text-xs text-slate-500">{entry.detail}</p>
            <span className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

