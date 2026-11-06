import { supabase } from '@/lib/supabase/client';
export function bad(id: string) {
  void supabase.from('profiles').update({ x: 1 }).eq('user_id', id);
  supabase.from('likes').insert({ post_id: id });
}
