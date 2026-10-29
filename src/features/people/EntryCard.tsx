import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';

import type { Currency } from '../../types/domain';
import type { PersistedEntry } from '../../types/persistence';
import { formatDate, formatMoney } from '../../utils/format';
import { useLongPress } from '../../hooks/useLongPress';

const ENTRY_ACTION_WIDTH = 84;
const ENTRY_OPEN_THRESHOLD = 42;
const ENTRY_AXIS_THRESHOLD = 7;

function moneyTone(value: number) {
  return value > 0 ? 'money-positive' : value < 0 ? 'money-negative' : 'money-neutral';
}

function moneyScale(value: number, currency: Currency) {
  const length = formatMoney(value, currency, false).length;
  return length >= 8 ? 'money-amount-xl' : length >= 7 ? 'money-amount-lg' : '';
}

interface EntryDrag {
  pointerId: number;
  startX: number;
  startY: number;
  baseOffset: number;
  axis: 'pending' | 'horizontal' | 'vertical' | 'longpress';
}

interface EntryCardProps {
  entry: PersistedEntry;
  title: string;
  effect: number;
  currency: Currency;
  swipeOpen: boolean;
  /** The payment recorded with a bonus: shown in its own colour, apart from plain salary. */
  isBonus?: boolean;
  onSwipeOpen: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function EntryCard({
  entry,
  title,
  effect,
  currency,
  swipeOpen,
  isBonus = false,
  onSwipeOpen,
  onEdit,
  onDelete,
}: EntryCardProps) {
  const dragRef = useRef<EntryDrag | null>(null);
  const currentOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const restingOffset = swipeOpen ? -ENTRY_ACTION_WIDTH : 0;
  const visibleOffset = dragOffset ?? restingOffset;
  const longPress = useLongPress({
    onLongPress: () => {
      if (dragRef.current) dragRef.current.axis = 'longpress';
      onSwipeOpen(false);
      onEdit();
    },
  });

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset: restingOffset,
      axis: 'pending',
    };
    currentOffsetRef.current = restingOffset;
    longPress.start(event.pointerId, event.clientX, event.clientY);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    longPress.move(event.pointerId, event.clientX, event.clientY);

    if (drag.axis === 'pending') {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < ENTRY_AXIS_THRESHOLD) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        drag.axis = 'vertical';
        longPress.cancel();
        return;
      }
      drag.axis = 'horizontal';
      longPress.cancel();
      setIsDragging(true);
    }

    if (drag.axis !== 'horizontal') return;
    event.preventDefault();
    const nextOffset = Math.max(-ENTRY_ACTION_WIDTH, Math.min(0, drag.baseOffset + deltaX));
    currentOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function finishPointerGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.axis === 'horizontal') {
      onSwipeOpen(currentOffsetRef.current <= -ENTRY_OPEN_THRESHOLD);
    } else if (drag.axis === 'pending' && swipeOpen) {
      onSwipeOpen(false);
    }
    dragRef.current = null;
    longPress.cancel();
    setDragOffset(null);
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function cancelPointerGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    longPress.cancel();
    currentOffsetRef.current = restingOffset;
    setDragOffset(null);
    setIsDragging(false);
  }

  return (
    <div className="entry-swipe-shell" data-entry-swipe-id={entry.id}>
      <div aria-hidden={!swipeOpen} className="entry-swipe-action">
        <button
          aria-label={`Delete entry dated ${formatDate(entry.date)}`}
          onClick={() => {
            onSwipeOpen(false);
            onDelete();
          }}
          tabIndex={swipeOpen ? 0 : -1}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
          </svg>
          <span>Delete</span>
        </button>
      </div>
      <div
        aria-label={`${title}, ${formatMoney(effect, currency)}. Long press or press F2 to edit`}
        className={`entry-card-surface ${isBonus ? 'is-bonus' : ''} ${entry.comment ? 'has-comment' : ''} ${isDragging ? 'is-dragging' : ''} ${longPress.isPressing ? 'is-pressing' : ''}`}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            onEdit();
          }
        }}
        onPointerCancel={cancelPointerGesture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerGesture}
        style={{ transform: `translate3d(${visibleOffset}px, 0, 0)` }}
        tabIndex={0}
      >
        <strong
          className={`entry-kind ${isBonus ? 'entry-kind-bonus' : entry.category === 'salary' ? 'entry-kind-salary' : entry.type === 'Gave' ? 'positive' : 'negative'}`}
        >
          {title}
        </strong>
        <strong
          className={`money-value-pill entry-amount ${moneyTone(effect)} ${moneyScale(effect, currency)}`}
        >
          {formatMoney(effect, currency, false)}
        </strong>
        {entry.comment && <p className="entry-comment">{entry.comment}</p>}
        <small className="entry-date">{formatDate(entry.date)}</small>
      </div>
    </div>
  );
}
