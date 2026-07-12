// ── src/lib/dm.ts — Direct Messages client service ────────────────────────────
//
// Thin wrappers over the private /api/dm/* server routes. There is NO direct
// Supabase access here on purpose: messages/conversations are deny-default under
// RLS (the anon key can't read them), so every call goes through the service-
// role routes, which resolve the caller's Privy DID → users.id and
// participant-check.
//
// POLLING MODEL (no table-level realtime — privacy: the anon key must never read
// messages, which rules out Supabase Realtime on these tables):
//   • THREAD open  → poll getThread every ~4–5s while the thread is on screen.
//   • INBOX        → refetch on focus / on open (not on a timer).
// A Realtime/websocket upgrade can come later WITHOUT a schema change (e.g. a
// server-sent-events endpoint fed by the service role) — the shapes below stay.
//
// Every call passes `fromDid` = the Privy user.id (the caller's identity). The
// UI stages read the optimistic-friendly return shapes verbatim.

export interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;      // the sender's users.id (uuid)
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface InboxConversation {
  conversationId: string;
  otherUserId: string;        // the other participant's users.id (uuid)
  otherHandle: string | null;
  otherAvatar: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ThreadPage {
  messages: DMMessage[];   // oldest → newest
  hasMore: boolean;
  nextCursor: string | null; // pass as `before` for the previous (older) page
}

/** POLLING CADENCE constants — the UI stages import these so the timing lives in
 *  one place. */
export const THREAD_POLL_MS = 4500;

/**
 * Send a message to `toUserId` (the recipient's users.id uuid). Resolves/creates
 * the conversation server-side. Returns the created message + its conversationId.
 */
export async function sendMessage(
  fromDid: string,
  toUserId: string,
  body: string,
): Promise<{ conversationId: string; message: DMMessage }> {
  const res = await fetch('/api/dm/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromDid, toUserId, body }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `send failed (${res.status})`);
  return res.json();
}

/** The caller's conversations, newest-first, with unread counts. */
export async function getInbox(fromDid: string): Promise<InboxConversation[]> {
  const res = await fetch(`/api/dm/inbox?fromDid=${encodeURIComponent(fromDid)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`inbox failed (${res.status})`);
  return (await res.json()).conversations ?? [];
}

/**
 * A page of a conversation's messages (~50, oldest→newest). Pass `before` (an
 * ISO created_at cursor, from a prior page's nextCursor) to load older messages.
 */
export async function getThread(
  fromDid: string,
  conversationId: string,
  before?: string | null,
): Promise<ThreadPage> {
  const params = new URLSearchParams({ fromDid, conversationId });
  if (before) params.set('before', before);
  const res = await fetch(`/api/dm/thread?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`thread failed (${res.status})`);
  return res.json();
}

/** Mark the other party's messages in this conversation as read. Returns count. */
export async function markRead(fromDid: string, conversationId: string): Promise<number> {
  const res = await fetch('/api/dm/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromDid, conversationId }),
  });
  if (!res.ok) throw new Error(`read failed (${res.status})`);
  return (await res.json()).marked ?? 0;
}
