/** Capture before opening the nested modal. Focus without scrolling, then restore
 * the exact ledger scroll. Neither the page cache nor the parent dialog is touched.
 */
export function captureCreditPassbookReturn(trigger: Pick<HTMLElement, "focus">, scrollArea?: Pick<HTMLElement, "scrollTop"> | null) {
  const scrollTop = scrollArea?.scrollTop;
  return () => {
    trigger.focus({ preventScroll: true });
    if (scrollArea && scrollTop !== undefined) scrollArea.scrollTop = scrollTop;
  };
}
