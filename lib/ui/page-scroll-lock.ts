type PageLock = { count: number; bodyOverflow: string; rootOverflow: string };
const locks = new WeakMap<Document, PageLock>();

// Nested dialogs may unmount together in either order. Only the last owner
// restores the original page styles, never another dialog's temporary lock.
export function lockPageScroll(doc: Document = document): () => void {
  let lock = locks.get(doc);
  if (!lock) {
    lock = {
      count: 0,
      bodyOverflow: doc.body.style.overflow,
      rootOverflow: doc.documentElement.style.overflow,
    };
    locks.set(doc, lock);
    doc.body.style.overflow = "hidden";
    doc.documentElement.style.overflow = "hidden";
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lock.count--;
    if (lock.count === 0) {
      doc.body.style.overflow = lock.bodyOverflow;
      doc.documentElement.style.overflow = lock.rootOverflow;
      locks.delete(doc);
    }
  };
}
