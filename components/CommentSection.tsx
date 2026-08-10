import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Comment,
  CommentContentType,
  listComments,
  postComment,
  updateComment,
  deleteComment,
  flagComment
} from '../lib/comments';

interface CommentSectionProps {
  contentType: CommentContentType;
  contentId: string;
  theme: ThemeMode;
  onRequireSignIn: () => void;
}

const BODY_MAX = 5000;

const CommentSection: React.FC<CommentSectionProps> = ({ contentType, contentId, theme, onRequireSignIn }) => {
  const isLight = theme !== 'dark';
  const { user } = useAuth();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBody, setNewBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyPosting, setReplyPosting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const load = () => {
    setLoading(true);
    listComments(contentType, contentId)
      .then(setComments)
      .catch((error) => console.error('Failed to load comments:', error))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contentType, contentId]);

  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';
  const cardBg = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';
  const inputCls = `w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
    isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
  }`;

  const commenterName = (c: Comment) => c.commenter.username || c.commenter.displayName || 'A Reader';

  const handlePost = async () => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (!newBody.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      await postComment(contentType, contentId, user.id, newBody.trim());
      setNewBody('');
      load();
    } catch (error) {
      setPostError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setPosting(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (!replyBody.trim()) return;
    setReplyPosting(true);
    try {
      await postComment(contentType, contentId, user.id, replyBody.trim(), parentId);
      setReplyBody('');
      setReplyingTo(null);
      load();
    } catch (error) {
      console.error('Failed to post reply:', error);
    } finally {
      setReplyPosting(false);
    }
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditBody(c.body);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editBody.trim()) return;
    setEditSaving(true);
    try {
      await updateComment(contentType, editingId, editBody.trim());
      setEditingId(null);
      load();
    } catch (error) {
      console.error('Failed to save comment edit:', error);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(contentType, commentId);
      load();
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const handleFlag = async (commentId: string) => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    setFlagSubmitting(true);
    setFlagError(null);
    try {
      await flagComment(contentType, commentId, user.id);
      setFlaggedIds((prev) => new Set(prev).add(commentId));
      setFlaggingId(null);
    } catch (error) {
      setFlagError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setFlagSubmitting(false);
    }
  };

  const topLevel = comments
    .filter((c) => !c.parentCommentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const repliesByParent = new Map<string, Comment[]>();
  comments
    .filter((c) => c.parentCommentId)
    .forEach((c) => {
      const list = repliesByParent.get(c.parentCommentId!) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId!, list);
    });

  const renderActions = (c: Comment, isReply: boolean) => {
    const isOwn = user && c.commenter.id === user.id;
    const isFlagged = flaggedIds.has(c.id);

    return (
      <div className="flex items-center gap-4 mt-2 text-[11px] uppercase tracking-[0.15em]">
        {!isReply && (
          <button
            onClick={() => {
              if (!user) {
                onRequireSignIn();
                return;
              }
              setReplyingTo(replyingTo === c.id ? null : c.id);
              setReplyBody('');
            }}
            className={`${textMuted} hover:text-amber-700`}
          >
            Reply
          </button>
        )}
        {isOwn ? (
          <>
            <button onClick={() => startEdit(c)} className={`${textMuted} hover:text-amber-700`}>
              Edit
            </button>
            <button onClick={() => handleDelete(c.id)} className={`${textMuted} hover:text-red-500`}>
              Delete
            </button>
          </>
        ) : isFlagged ? (
          <span className={textMuted}>Flagged</span>
        ) : flaggingId === c.id ? (
          <span className="flex items-center gap-3">
            <button onClick={() => handleFlag(c.id)} disabled={flagSubmitting} className="text-red-500 hover:text-red-600 disabled:opacity-50">
              {flagSubmitting ? 'Submitting...' : 'Confirm Flag'}
            </button>
            <button onClick={() => setFlaggingId(null)} className={textMuted}>
              Cancel
            </button>
          </span>
        ) : (
          <button onClick={() => (user ? setFlaggingId(c.id) : onRequireSignIn())} className={`${textMuted} hover:text-red-500`}>
            Flag
          </button>
        )}
      </div>
    );
  };

  const renderComment = (c: Comment, isReply: boolean) => (
    <div key={c.id} className={`rounded-sm border p-4 ${cardBg}`}>
      <div className="flex items-center justify-between gap-4">
        <p className={`text-sm font-semibold ${isLight ? 'text-gray-900' : 'text-white'}`}>{commenterName(c)}</p>
        <p className={`text-[11px] ${textMuted}`}>{new Date(c.createdAt).toLocaleDateString()}</p>
      </div>

      {editingId === c.id ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value.slice(0, BODY_MAX))}
            maxLength={BODY_MAX}
            rows={3}
            className={inputCls}
          />
          <div className="flex gap-3">
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              className="text-[11px] uppercase tracking-[0.15em] font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
            >
              {editSaving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditingId(null)} className={`text-[11px] uppercase tracking-[0.15em] ${textMuted}`}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={`text-sm mt-2 whitespace-pre-wrap ${isLight ? 'text-gray-800' : 'text-gray-200'}`}>{c.body}</p>
      )}

      {flaggingId === c.id && flagError && <p className="text-xs text-red-500 mt-2">{flagError}</p>}
      {renderActions(c, isReply)}

      {replyingTo === c.id && (
        <div className="mt-4 pl-4 border-l-2 border-amber-700/30 space-y-2">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value.slice(0, BODY_MAX))}
            maxLength={BODY_MAX}
            rows={2}
            placeholder="Write a reply..."
            className={inputCls}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePostReply(c.id)}
              disabled={replyPosting || !replyBody.trim()}
              className="text-[11px] uppercase tracking-[0.15em] font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-50"
            >
              {replyPosting ? 'Posting...' : 'Post Reply'}
            </button>
            <button onClick={() => setReplyingTo(null)} className={`text-[11px] uppercase tracking-[0.15em] ${textMuted}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(repliesByParent.get(c.id) ?? []).length > 0 && (
        <div className="mt-4 pl-4 border-l-2 border-current opacity-90 space-y-3">
          {(repliesByParent.get(c.id) ?? []).map((reply) => renderComment(reply, true))}
        </div>
      )}
    </div>
  );

  return (
    <div className={`mt-14 pt-10 border-t ${isLight ? 'border-black/10' : 'border-white/10'}`}>
      <h2 className={`text-xs uppercase tracking-[0.3em] mb-6 ${textMuted}`}>
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </h2>

      <div className="mb-8 space-y-2">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value.slice(0, BODY_MAX))}
          maxLength={BODY_MAX}
          rows={3}
          placeholder={user ? 'Share your thoughts...' : 'Sign in to leave a comment'}
          onFocus={() => !user && onRequireSignIn()}
          className={inputCls}
        />
        <div className="flex items-center justify-between gap-4">
          <span className={`text-xs ${textMuted}`}>{newBody.length}/{BODY_MAX}</span>
          {postError && <p className="text-xs text-red-500">{postError}</p>}
          <button
            onClick={handlePost}
            disabled={posting || !newBody.trim()}
            className="px-5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
          >
            {posting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className={`text-sm ${textMuted}`}>Loading comments...</p>
      ) : topLevel.length === 0 ? (
        <p className={`text-sm ${textMuted}`}>No comments yet. Be the first to share your thoughts.</p>
      ) : (
        <div className="space-y-4">{topLevel.map((c) => renderComment(c, false))}</div>
      )}
    </div>
  );
};

export default CommentSection;
