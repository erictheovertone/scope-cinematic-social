// ── POST /api/dm/send ─────────────────────────────────────────────────────────
// Body: { fromDid, toUserId, body }
//   fromDid  — the caller's Privy DID (user.id)
//   toUserId — the recipient's users.id (uuid)
//   body     — message text (1..2000)
//
// Resolves/creates the normalized conversation for the pair, inserts the message,
// updates last_message_*, and writes a SOCIAL notification (type 'message') for
// the recipient keyed by their Privy DID (the bell reads by DID).
import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, resolveCallerUuid, didForUuid, orderedPair } from '../_shared';

export const dynamic = 'force-dynamic';

const MAX_BODY = 2000;

export async function POST(req: NextRequest) {
  let payload: { fromDid?: string; toUserId?: string; body?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const { fromDid, toUserId } = payload;
  const body = (payload.body ?? '').trim();

  if (!fromDid || !toUserId) return NextResponse.json({ error: 'fromDid, toUserId required' }, { status: 400 });
  if (body.length === 0) return NextResponse.json({ error: 'empty message' }, { status: 400 });
  if (body.length > MAX_BODY) return NextResponse.json({ error: `message too long (max ${MAX_BODY})` }, { status: 413 });

  const supabase = serviceClient();

  const fromUuid = await resolveCallerUuid(supabase, fromDid);
  if (!fromUuid) return NextResponse.json({ error: 'unknown caller' }, { status: 401 });
  if (fromUuid === toUserId) return NextResponse.json({ error: 'cannot message yourself' }, { status: 400 });

  // Recipient must exist.
  const { data: recip } = await supabase.from('users').select('id').eq('id', toUserId).maybeSingle();
  if (!recip) return NextResponse.json({ error: 'recipient not found' }, { status: 404 });

  // Resolve/create the normalized conversation for the pair.
  const pair = orderedPair(fromUuid, toUserId);
  let conversationId: string | null = null;
  {
    const { data: existing } = await supabase
      .from('conversations').select('id').eq('user_a', pair.user_a).eq('user_b', pair.user_b).maybeSingle();
    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: created, error: convErr } = await supabase
        .from('conversations')
        .insert({ user_a: pair.user_a, user_b: pair.user_b, last_message_preview: preview(body) })
        .select('id').single();
      if (convErr || !created) {
        // Lost a create race → re-read the now-existing pair.
        const { data: raced } = await supabase
          .from('conversations').select('id').eq('user_a', pair.user_a).eq('user_b', pair.user_b).maybeSingle();
        conversationId = raced?.id ?? null;
      } else {
        conversationId = created.id;
      }
    }
  }
  if (!conversationId) return NextResponse.json({ error: 'could not open conversation' }, { status: 500 });

  // Insert the message.
  const { data: msg, error: msgErr } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: fromUuid, body })
    .select('id, conversation_id, sender_id, body, created_at, read_at').single();
  if (msgErr || !msg) {
    console.error('[dm/send] message insert failed:', msgErr?.message);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }

  // Denormalize newest-message onto the conversation for the inbox list.
  await supabase.from('conversations')
    .update({ last_message_at: msg.created_at, last_message_preview: preview(body) })
    .eq('id', conversationId);

  // Fire-and-forget SOCIAL notification for the recipient (bell reads by DID).
  ;(async () => {
    try {
      const recipientDid = await didForUuid(supabase, toUserId);
      if (!recipientDid) return;
      const { data: sender } = await supabase
        .from('profiles').select('username, profile_image_url').eq('user_id', fromUuid).maybeSingle();
      const uname = sender?.username ?? 'someone';
      await supabase.from('notifications').insert({
        recipient_id: recipientDid,
        sender_id: fromDid,
        sender_username: uname,
        sender_avatar: sender?.profile_image_url ?? null,
        type: 'message',
        post_id: null,
        post_image_url: null,
        message: `@${uname} sent you a message: ${preview(body)}`,
        is_read: false,
      });
    } catch (e) {
      console.error('[dm/send] notification exception:', e);
    }
  })();

  return NextResponse.json({ conversationId, message: msg });
}

function preview(s: string): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > 80 ? clean.slice(0, 80) + '…' : clean;
}
