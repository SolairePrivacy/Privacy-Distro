import type { FlashEntry } from '../types';

type FlashBannerProps = {
  flash: FlashEntry | null;
};

export function FlashBanner({ flash }: FlashBannerProps) {
  if (!flash) {
    return null;
  }

  const toneClasses =
    flash.tone === 'positive'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/40 bg-rose-500/10 text-rose-200';

  return (
    <div className={['rounded-lg border px-4 py-3 text-sm', toneClasses].join(' ')}>
      {flash.message}
    </div>
  );
}

