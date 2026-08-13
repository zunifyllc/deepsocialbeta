/** Authors may edit a post's text for this long after creating it. */
export const EDIT_WINDOW_MS = 30 * 60 * 1000;

export function editWindowRemainingMs(createdAt: string, now: number = Date.now()): number {
  return Math.max(0, new Date(createdAt).getTime() + EDIT_WINDOW_MS - now);
}

export function canEditPost(createdAt: string, now: number = Date.now()): boolean {
  return editWindowRemainingMs(createdAt, now) > 0;
}
