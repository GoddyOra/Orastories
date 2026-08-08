import { supabase } from './supabaseClient';

export async function logRead(chapterId: string, readerId: string) {
  return supabase
    .from('reads')
    .upsert(
      { chapter_id: chapterId, reader_id: readerId },
      { onConflict: 'reader_id,chapter_id,read_date', ignoreDuplicates: true }
    );
}
