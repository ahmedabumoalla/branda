"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type DragView = { key: number; offset: number; target: number; after: boolean };
type DragSession = {
  key: number; pointerId: number; handle: HTMLButtonElement; table: HTMLTableElement;
  startY: number; startScroll: number; clientY: number; active: boolean;
  startRowTop: number; rowHeight: number; scroll: HTMLElement; frame: number | null; destination: number;
};

/** Pointer capture supports mouse, pen and touch without dragging only the icon. */
export function useInvoiceLineDrag(disabled: boolean, count: number, move: (key: number, destination: number) => void) {
  const [drag, setDrag] = useState<DragView | null>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);

  function clear(update = true) {
    const current = session.current;
    session.current = null;
    if (current?.frame !== null && current?.frame !== undefined) cancelAnimationFrame(current.frame);
    if (current?.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    if (update) setDrag(null);
  }

  useEffect(() => {
    if (disabled) clear();
    return () => clear(false);
  }, [disabled]);

  function update(current: DragSession) {
    const rows = Array.from(current.table.querySelectorAll<HTMLTableRowElement>("tbody > tr[data-invoice-line-key]"))
      .filter(row => Number(row.dataset.invoiceLineKey) !== current.key);
    if (!rows.length) return;
    let destination = rows.findIndex(row => {
      const bounds = row.getBoundingClientRect();
      return current.clientY < bounds.top + bounds.height / 2;
    });
    const after = destination === -1;
    if (after) destination = rows.length;
    const target = rows[Math.min(destination, rows.length - 1)];
    current.destination = destination;
    const scrollOffset = current.scroll.scrollTop - current.startScroll;
    const normalTop = current.startRowTop - scrollOffset;
    const bounds = current.table.tBodies[0].getBoundingClientRect();
    const offset = Math.max(bounds.top - normalTop, Math.min(bounds.bottom - normalTop - current.rowHeight, current.clientY - current.startY + scrollOffset));
    setDrag({ key: current.key, offset, target: Number(target.dataset.invoiceLineKey), after });
  }

  function scrollFrame(current: DragSession) {
    if (session.current !== current || !current.active) return;
    const viewport = current.scroll === document.scrollingElement;
    const bounds = viewport ? { top: 0, bottom: window.innerHeight } : current.scroll.getBoundingClientRect();
    const edge = 56;
    const distance = current.clientY < bounds.top + edge ? -Math.min(16, (bounds.top + edge - current.clientY) / 3)
      : current.clientY > bounds.bottom - edge ? Math.min(16, (current.clientY - bounds.bottom + edge) / 3) : 0;
    if (distance) {
      const previous = current.scroll.scrollTop;
      current.scroll.scrollTop += distance;
      if (previous !== current.scroll.scrollTop) update(current);
    }
    current.frame = requestAnimationFrame(() => scrollFrame(current));
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>, key: number) {
    if (disabled || count < 2 || !event.isPrimary || event.button !== 0) return;
    clear();
    suppressClick.current = false;
    const handle = event.currentTarget;
    const table = handle.closest("table");
    const row = handle.closest("tr");
    if (!table || !row) return;
    let scroll = table.parentElement;
    while (scroll && !(scroll.scrollHeight > scroll.clientHeight && /auto|scroll/.test(getComputedStyle(scroll).overflowY))) scroll = scroll.parentElement;
    scroll ??= document.scrollingElement as HTMLElement;
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    const rowBounds = row.getBoundingClientRect();
    const notes = row.nextElementSibling as HTMLTableRowElement | null;
    const rowHeight = rowBounds.height + (notes && !notes.hasAttribute("data-invoice-line-key") ? notes.getBoundingClientRect().height : 0);
    session.current = { key, pointerId: event.pointerId, handle, table, startY: event.clientY, startScroll: scroll.scrollTop, clientY: event.clientY, active: false, startRowTop: rowBounds.top, rowHeight, scroll, frame: null, destination: 0 };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId || disabled) return;
    current.clientY = event.clientY;
    if (!current.active && Math.abs(current.clientY - current.startY) < 6) return;
    event.preventDefault();
    if (!current.active) {
      current.active = true;
      suppressClick.current = true;
      scrollFrame(current);
    }
    update(current);
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const current = session.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.active && !disabled) {
      current.clientY = event.clientY;
      update(current);
      move(current.key, current.destination);
      requestAnimationFrame(() => { if (current.handle.isConnected) current.handle.focus({ preventScroll: true }); });
    }
    clear();
  }

  return {
    drag, pointerDown, pointerMove, pointerUp, cancel: () => clear(),
    consumeClick: () => { const value = suppressClick.current; suppressClick.current = false; return value; },
  };
}
