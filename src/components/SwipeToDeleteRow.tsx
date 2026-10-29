import { type PointerEvent as ReactPointerEvent, type ReactNode, useRef, useState } from 'react';

import { useLongPress } from '../hooks/useLongPress';

const ACTION_WIDTH = 84;
const OPEN_THRESHOLD = 42;
const AXIS_THRESHOLD = 7;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  baseOffset: number;
  axis: 'pending' | 'horizontal' | 'vertical' | 'longpress';
}

interface SwipeToDeleteRowProps {
  /** Lets the page close an open row when something else is touched. */
  rowId: string;
  swipeOpen: boolean;
  onSwipeOpen: (open: boolean) => void;
  onDelete: () => void;
  /** A tap, a long press or Enter — whatever opens the row for editing. */
  onActivate: () => void;
  deleteLabel: string;
  deleteText: string;
  className?: string;
  children: ReactNode;
}

/**
 * A row you can swipe left to reveal Delete, the same gesture entries use: a horizontal drag
 * slides the row over the action, a long press opens it for editing, and a tap does too — unless
 * the row was just swiped, in which case the tap only closes it again.
 */
export function SwipeToDeleteRow({
  rowId,
  swipeOpen,
  onSwipeOpen,
  onDelete,
  onActivate,
  deleteLabel,
  deleteText,
  className = '',
  children,
}: SwipeToDeleteRowProps) {
  const dragRef = useRef<Drag | null>(null);
  const currentOffsetRef = useRef(0);
  const swipedRef = useRef(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const restingOffset = swipeOpen ? -ACTION_WIDTH : 0;
  const visibleOffset = dragOffset ?? restingOffset;
  const longPress = useLongPress({
    onLongPress: () => {
      if (dragRef.current) dragRef.current.axis = 'longpress';
      swipedRef.current = true;
      onSwipeOpen(false);
      onActivate();
    },
  });

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    swipedRef.current = false;
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
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_THRESHOLD) return;
      longPress.cancel();
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        drag.axis = 'vertical';
        return;
      }
      drag.axis = 'horizontal';
      swipedRef.current = true;
    }

    if (drag.axis !== 'horizontal') return;
    event.preventDefault();
    const nextOffset = Math.max(-ACTION_WIDTH, Math.min(0, drag.baseOffset + deltaX));
    currentOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.axis === 'horizontal') onSwipeOpen(currentOffsetRef.current <= -OPEN_THRESHOLD);
    dragRef.current = null;
    longPress.cancel();
    setDragOffset(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function cancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    longPress.cancel();
    currentOffsetRef.current = restingOffset;
    setDragOffset(null);
  }

  return (
    <div className="entry-swipe-shell swipe-row-shell" data-entry-swipe-id={rowId}>
      <div aria-hidden={!swipeOpen} className="entry-swipe-action">
        <button
          aria-label={deleteLabel}
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
          <span>{deleteText}</span>
        </button>
      </div>
      <div
        className={`swipe-row-surface ${longPress.isPressing ? 'is-pressing' : ''} ${className}`}
        onClick={() => {
          // The click that ends a swipe or a long press isn't a tap; one on an open row just closes it.
          if (swipedRef.current) {
            swipedRef.current = false;
            return;
          }
          if (swipeOpen) onSwipeOpen(false);
          else onActivate();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate();
          }
        }}
        onPointerCancel={cancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finish}
        role="button"
        style={{ transform: `translate3d(${visibleOffset}px, 0, 0)` }}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
