// ── GET /api/dm/thread?fromDid=&conversationId=&before= ───────────────────────
// A page of a conversation's messages (~50), PARTICIPANT-VERIFIED (403 if the
// caller is not user_a/user_b). `before` = an ISO created_at cursor for older
// pages. Messages are returned oldest→newest within the page (chat order).
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, resolveCallerUuid, isParticipant } from '../_shared';

export const dynamic = 'force-dynamic';

const PAGE = 50;

export async function GET(req: NextRequest) {
  const fromDid = req.nextUrl.searchParams.get('fromDid');
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  const before = req.nextUrl.searchParams.get('before'); // ISO timestamp cursor
  if (!fromDid || !conversationId) return NextResponse.json({ error: 'fromDid, conversationId required' }, { status: 400 });

  const supabase = serviceClient();
  const meUuid = await resolveCallerUuid(supabase, fromDid);
  if (!meUuid) return NextResponse.json({ error: 'unknown caller' }, { status: 401 });

  // Ownership check — the caller must be a participant, else 403.
  const { data: conv } = await supabase
    .from('conversations').select('id, user_a, user_b').eq('id', conversationId).maybeSingle();
  if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });
  if (!isParticipant(conv, meUuid)) return NextResponse.json({ error: 'not a participant' }, { status: 403 });

  // Fetch newest PAGE (optionally older than the cursor), then reverse to
  // oldest→newest for rendering.
  let q = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt('created_at', before);

  const { data: desc } = await q;
  const page = (desc ?? []).slice().reverse();
  const hasMore = (desc ?? []).length === PAGE;
  const nextCursor = hasMore && page.length > 0 ? page[0].created_at : null;

  return NextResponse.json({ messages: page, hasMore, nextCursor });
}
