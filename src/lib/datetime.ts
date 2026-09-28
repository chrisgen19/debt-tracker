/**
 * A moment as a `datetime-local` input wants it: the device's wall-clock time to the
 * minute, with no offset. `toISOString` would give UTC, which the input would then
 * display as if it were local.
 */
export function toLocalInput(date: Date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

/**
 * The reverse, for sending: a `datetime-local` value read as the device's own wall-clock
 * time and pinned to an exact instant (UTC ISO).
 *
 * Sending the bare value let the server read it in *its* timezone instead. Production
 * runs on Asia/Manila, so a phone set to any other timezone shifted the entry by the
 * difference, even on an edit that never touched the date. With an explicit instant the
 * server's timezone no longer matters.
 *
 * An unparseable value (a cleared date field) is passed through untouched, so the
 * server's own validation still answers with a message rather than this throwing.
 */
export function toInstant(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
