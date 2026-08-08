import { supabase } from './supabaseClient';
import { CreatorApplication } from '../types';

function rowToApplication(row: any): CreatorApplication {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at
  };
}

export async function getMyApplication(userId: string): Promise<CreatorApplication | null> {
  const { data, error } = await supabase
    .from('creator_applications')
    .select('id,user_id,message,status,created_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToApplication(data) : null;
}

export async function submitCreatorApplication(userId: string, message: string) {
  const { error } = await supabase
    .from('creator_applications')
    .insert({ user_id: userId, message, status: 'pending' });

  if (error) {
    if (error.code === '23505') {
      throw new Error('You already have an application on file.');
    }
    throw error;
  }
}
