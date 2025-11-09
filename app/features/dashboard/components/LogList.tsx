import type { LogEntry } from '../types';

type LogListProps = {
  entries: LogEntry[];
};

export function LogList({ entries }: LogListProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur max-w-xl w-full">
      <h2 className="text-lg font-semibold">Relay log</h2>
      {entries.length === 0 && <p className="mt-2 text-sm text-slate-400">Awaiting activity.</p>}
      <ul className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-200">{entry.scope}</p>
            <p className="mt-1 text-slate-300">{entry.message}</p>
            <span className="mt-1 block text-[11px]">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

