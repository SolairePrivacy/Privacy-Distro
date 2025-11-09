import type { Recipient } from '../types';
import { formatShort } from '../utils';

type PayoutBuilderProps = {
  recipientAddress: string;
  onRecipientAddressChange: (value: string) => void;
  recipientAmount: string;
  onRecipientAmountChange: (value: string) => void;
  recipients: Recipient[];
  onAddRecipient: () => void;
  onRemoveRecipient: (id: string) => void;
  onSubmit: () => void | Promise<void>;
  isProcessing: boolean;
};

export function PayoutBuilder({
  recipientAddress,
  onRecipientAddressChange,
  recipientAmount,
  onRecipientAmountChange,
  recipients,
  onAddRecipient,
  onRemoveRecipient,
  onSubmit,
  isProcessing,
}: PayoutBuilderProps) {
  return (
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
            onChange={(event) => onRecipientAddressChange(event.target.value)}
          />
          <input
            className="input"
            placeholder="Amount (SOL)"
            inputMode="decimal"
            value={recipientAmount}
            onChange={(event) => onRecipientAmountChange(event.target.value)}
          />
          <button className="btn md:h-12" onClick={onAddRecipient}>
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
                onClick={() => onRemoveRecipient(recipient.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className="btn w-full" onClick={onSubmit} disabled={isProcessing || recipients.length === 0}>
          {isProcessing ? 'Processing…' : `Send ${recipients.length || ''} ${recipients.length === 1 ? 'payout' : 'payouts'}`}
        </button>
      </div>
    </div>
  );
}

