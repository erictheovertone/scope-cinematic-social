// ── POST /api/dm/read ─────────────────────────────────────────────────────────
// Body: { fromDid, conversationId }
// Marks the OTHER party's unread messages in this conversation as read (read_at
// = now). PARTICIPANT-VERIFIED (403 otherwise). Never touches the caller's own
// messages (read_at on your own sends is meaningless).
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, resolveCallerUuid, isParticipant } from '../_shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let payload: { fromDid?: string; conversationId?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { fromDid, conversationId } = payload;
  if (!fromDid || !conversationId) return NextResponse.json({ error: 'fromDid, conversationId required' }, { status: 400 });

  const supabase = serviceClient();
  const meUuid = await resolveCallerUuid(supabase, fromDid);
  if (!meUuid) return NextResponse.json({ error: 'unknown caller' }, { status: 401 });

  const { data: conv } = await supabase
    .from('conversations').select('id, user_a, user_b').eq('id', conversationId).maybeSingle();
  if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  if (!isParticipant(conv, meUuid)) return NextResponse.json({ error: 'not a participant' }, { status: 403 });

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('messages')
    .update({ read_at: nowIso })
    .eq('conversation_id', conversationId)
    .neq('sender_id', meUuid)
    .is('read_at', null)
    .select('id');
  if (error) {
    console.error('[dm/read] update failed:', error.message);
    return NextResponse.json({ error: 'read failed' }, { status: 500 });
  }

  return NextResponse.json({ marked: updated?.length ?? 0 });
}
