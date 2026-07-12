// ── GET /api/dm/inbox?fromDid= ────────────────────────────────────────────────
// The caller's conversations, newest-first. Each row: the OTHER participant
// (handle, avatar, their users.id), last_message_preview, last_message_at, and
// unread count (messages the other party sent that the caller hasn't read).
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, resolveCallerUuid } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const fromDid = req.nextUrl.searchParams.get('fromDid');
  if (!fromDid) return NextResponse.json({ error: 'fromDid required' }, { status: 400 });

  const supabase = serviceClient();
  const meUuid = await resolveCallerUuid(supabase, fromDid);
  if (!meUuid) return NextResponse.json({ error: 'unknown caller' }, { status: 401 });

  // Conversations where I am either participant, newest-first.
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, user_a, user_b, last_message_at, last_message_preview')
    .or(`user_a.eq.${meUuid},user_b.eq.${meUuid}`)
    .order('last_message_at', { ascending: false })
    .limit(100);

  const rows = convs ?? [];
  if (rows.length === 0) return NextResponse.json({ conversations: [] });

  // Resolve the other participant's profile in one batch.
  const otherUuids = [...new Set(rows.map(c => (c.user_a === meUuid ? c.user_b : c.user_a)))];
  const { data: profiles } = await supabase
    .from('profiles').select('user_id, username, profile_image_url').in('user_id', otherUuids);
  const profByUuid = new Map((profiles ?? []).map(p => [p.user_id, p]));

  // Unread counts: messages in these conversations the OTHER party sent, unread.
  const convIds = rows.map(c => c.id);
  const { data: unreadRows } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', convIds)
    .neq('sender_id', meUuid)
    .is('read_at', null);
  const unreadByConv = new Map<string, number>();
  for (const m of unreadRows ?? []) {
    unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
  }

  const conversations = rows.map(c => {
    const otherUuid = c.user_a === meUuid ? c.user_b : c.user_a;
    const prof = profByUuid.get(otherUuid);
    return {
      conversationId: c.id,
      otherUserId: otherUuid,
      otherHandle: prof?.username ?? null,
      otherAvatar: prof?.profile_image_url ?? null,
      lastMessagePreview: c.last_message_preview ?? null,
      lastMessageAt: c.last_message_at,
      unreadCount: unreadByConv.get(c.id) ?? 0,
    };
  });

  return NextResponse.json({ conversations });
}
