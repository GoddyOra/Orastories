import { supabase } from './supabaseClient';

export type CommentContentType = 'book' | 'article';

export interface Comment {
  id: string;
  body: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  commenter: {
    id: string;
    username: string | null;
    displayName: string | null;
  };
}

const TABLE: Record<CommentContentType, string> = {
  book: 'book_comments',
  article: 'article_comments'
};

const FK_COLUMN: Record<CommentContentType, string> = {
  book: 'book_id',
  article: 'article_id'
};

function mapRow(row: any): Comment {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    id: row.id,
    body: row.body,
    parentCommentId: row.parent_comment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commenter: {
      id: row.commenter_id,
      username: profile?.username ?? null,
      displayName: profile?.display_name ?? null
    }
  };
}

export async function listComments(contentType: CommentContentType, contentId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from(TABLE[contentType])
    .select('id,body,parent_comment_id,commenter_id,created_at,updated_at,profiles(username,display_name)')
    .eq(FK_COLUMN[contentType], contentId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export const listBookComments = (bookId: string) => listComments('book', bookId);
export const listArticleComments = (articleId: string) => listComments('article', articleId);

export async function postComment(
  contentType: CommentContentType,
  contentId: string,
  commenterId: string,
  body: string,
  parentCommentId: string | null = null
): Promise<Comment> {
  const { data, error } = await supabase
    .from(TABLE[contentType])
    .insert({
      [FK_COLUMN[contentType]]: contentId,
      commenter_id: commenterId,
      body,
      parent_comment_id: parentCommentId
    })
    .select('id,body,parent_comment_id,commenter_id,created_at,updated_at,profiles(username,display_name)')
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function updateComment(contentType: CommentContentType, commentId: string, body: string) {
  const { error } = await supabase
    .from(TABLE[contentType])
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) throw error;
}

export async function deleteComment(contentType: CommentContentType, commentId: string) {
  const { error } = await supabase.from(TABLE[contentType]).delete().eq('id', commentId);
  if (error) throw error;
}

export async function flagComment(
  contentType: CommentContentType,
  commentId: string,
  flaggerId: string,
  reason?: string
) {
  const { error } = await supabase
    .from('comment_flags')
    .insert({ content_type: contentType, comment_id: commentId, flagger_id: flaggerId, reason: reason || null });
  if (error) {
    if (error.code === '23505') {
      throw new Error("You've already flagged this comment.");
    }
    throw error;
  }
}
