import { useEffect, useId, useRef, useState } from 'react';

import { useTranslation } from '../i18n/useTranslation';

interface ConfirmDialogProps {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  tertiaryLabel?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onTertiary?: () => void | Promise<void>;
}

export function ConfirmDialog({
  title,
  message,
  cancelLabel,
  confirmLabel,
  confirmVariant = 'danger',
  tertiaryLabel,
  onCancel,
  onConfirm,
  onTertiary,
}: ConfirmDialogProps) {
  const t = useTranslation();
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [onCancel]);

  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section aria-labelledby={titleId} aria-modal="true" className="confirm-dialog" role="dialog">
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        {tertiaryLabel && onTertiary && (
          <button
            className="text-button confirm-tertiary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onTertiary()).finally(() => setBusy(false));
            }}
            type="button"
          >
            {tertiaryLabel}
          </button>
        )}
        <div className="confirm-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel ?? t('Cancel')}
          </button>
          <button
            className={confirmVariant === 'primary' ? 'primary-button' : 'danger-button'}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onConfirm()).finally(() => setBusy(false));
            }}
            type="button"
          >
            {confirmLabel ?? t('Delete')}
          </button>
        </div>
      </section>
    </div>
  );
}
