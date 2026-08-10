import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import {
  MyArticle,
  ArticleFields,
  listMyArticles,
  createArticle,
  updateArticle,
  setArticlePublished,
  uploadArticleCover
} from '../lib/articles';
import ArticleBodyEditor from './ArticleBodyEditor';

interface ArticleStudioProps {
  theme: ThemeMode;
  authorId: string;
  onSelectArticle: (slug: string) => void;
}

const MIN_KEYWORDS = 3;
const MAX_KEYWORDS = 5;

const emptyFields: ArticleFields = { title: '', body: '', keywords: [] };

const ArticleStudio: React.FC<ArticleStudioProps> = ({ theme, authorId, onSelectArticle }) => {
  const isLight = theme !== 'dark';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';
  const cardCls = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';
  const inputCls = `w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
    isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
  }`;

  const [articles, setArticles] = useState<MyArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  const [fields, setFields] = useState<ArticleFields>(emptyFields);
  const [keywordInput, setKeywordInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const loadArticles = () => {
    setLoading(true);
    listMyArticles(authorId)
      .then(setArticles)
      .catch((error) => console.error('Failed to load your articles:', error))
      .finally(() => setLoading(false));
  };

  useEffect(loadArticles, [authorId]);

  const startNew = () => {
    setSelectedId('new');
    setFields(emptyFields);
    setKeywordInput('');
    setFormError(null);
  };

  const startEdit = (article: MyArticle) => {
    setSelectedId(article.id);
    setFields({ title: article.title, body: article.body, keywords: article.keywords });
    setKeywordInput('');
    setFormError(null);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim().toLowerCase();
    if (!kw) return;
    if (fields.keywords.includes(kw)) {
      setKeywordInput('');
      return;
    }
    if (fields.keywords.length >= MAX_KEYWORDS) return;
    setFields({ ...fields, keywords: [...fields.keywords, kw] });
    setKeywordInput('');
  };

  const removeKeyword = (kw: string) => {
    setFields({ ...fields, keywords: fields.keywords.filter((k) => k !== kw) });
  };

  const validate = (): string | null => {
    if (!fields.title.trim()) return 'Title is required.';
    if (!fields.body.trim()) return 'Body text is required.';
    if (fields.keywords.length < MIN_KEYWORDS) return `Add at least ${MIN_KEYWORDS} keywords.`;
    if (fields.keywords.length > MAX_KEYWORDS) return `No more than ${MAX_KEYWORDS} keywords.`;
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (selectedId === 'new') {
        const { id } = await createArticle(authorId, fields);
        loadArticles();
        setSelectedId(id);
      } else if (selectedId) {
        await updateArticle(selectedId, fields);
        loadArticles();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const handleCoverSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedId || selectedId === 'new') return;

    setCoverError(null);
    setCoverUploading(true);
    try {
      const altText = `${fields.title} — ${fields.keywords.join(', ')}`;
      await uploadArticleCover(selectedId, file, altText);
      loadArticles();
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : 'Failed to upload cover.');
    } finally {
      setCoverUploading(false);
    }
  };

  const handleTogglePublished = async (article: MyArticle) => {
    try {
      await setArticlePublished(article.id, !article.isPublished);
      loadArticles();
    } catch (error) {
      console.error('Failed to update published state:', error);
    }
  };

  const selectedArticle = selectedId && selectedId !== 'new' ? articles.find((a) => a.id === selectedId) : null;

  if (selectedId) {
    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          className={`mb-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold ${textMuted} hover:text-amber-700`}
        >
          <span className="text-base leading-none">←</span> My Articles
        </button>

        <h2 className={`text-2xl font-['Playfair_Display'] mb-8 ${isLight ? 'text-gray-900' : 'text-white'}`}>
          {selectedId === 'new' ? 'New Article' : 'Edit Article'}
        </h2>

        <div className={`rounded-sm border p-6 sm:p-8 space-y-5 ${cardCls}`}>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>
              Title ({fields.title.length}/150)
            </label>
            <input
              className={inputCls}
              maxLength={150}
              value={fields.title}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
            />
          </div>

          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>
              Keywords ({fields.keywords.length}/{MAX_KEYWORDS}, minimum {MIN_KEYWORDS}) — for SEO
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {fields.keywords.map((kw) => (
                <span
                  key={kw}
                  className={`inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full border ${
                    isLight ? 'border-black/15 text-gray-700' : 'border-white/15 text-gray-300'
                  }`}
                >
                  {kw}
                  <button type="button" onClick={() => removeKeyword(kw)} className="hover:text-red-500">
                    ×
                  </button>
                </span>
              ))}
            </div>
            {fields.keywords.length < MAX_KEYWORDS && (
              <input
                className={inputCls}
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                onBlur={addKeyword}
                placeholder="Type a keyword and press Enter"
              />
            )}
          </div>

          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Body</label>
            <ArticleBodyEditor value={fields.body} onChange={(body) => setFields({ ...fields, body })} theme={theme} />
          </div>

          {selectedId !== 'new' && (
            <div>
              <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Cover Image</label>
              <div className="flex items-center gap-4">
                <label className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-current cursor-pointer hover:text-amber-700">
                  {coverUploading ? 'Uploading...' : selectedArticle?.coverImageUrl ? 'Replace Cover' : 'Upload Cover'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverSelected} disabled={coverUploading} />
                </label>
                {selectedArticle?.coverImageUrl && <span className="text-xs text-amber-700">Cover uploaded ✓</span>}
              </div>
              {coverError && <p className="text-sm text-red-500 mt-2">{coverError}</p>}
            </div>
          )}

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : selectedId === 'new' ? 'Publish Article' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl font-['Playfair_Display'] ${isLight ? 'text-gray-900' : 'text-white'}`}>My Articles</h2>
        <button
          onClick={startNew}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white transition-all"
        >
          New Article
        </button>
      </div>

      {loading ? (
        <p className={`text-sm ${textMuted}`}>Loading your articles...</p>
      ) : articles.length === 0 ? (
        <p className={`text-sm ${textMuted}`}>You haven't written any articles yet.</p>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <div key={article.id} className={`flex items-center justify-between rounded-sm border p-4 ${cardCls}`}>
              <div className="min-w-0">
                <span className={`text-sm ${isLight ? 'text-gray-900' : 'text-white'}`}>{article.title}</span>
                <p className={`text-xs mt-1 ${textMuted}`}>
                  {article.viewCount} view{article.viewCount === 1 ? '' : 's'}
                  {article.removedReason && <span className="text-red-500"> — removed ({article.removedReason.replace('flagged_', 'flagged ')})</span>}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs uppercase tracking-[0.15em] flex-shrink-0">
                {article.isPublished && !article.removedReason && (
                  <button onClick={() => onSelectArticle(article.slug)} className={`${textMuted} hover:text-amber-700`}>
                    View
                  </button>
                )}
                <button onClick={() => handleTogglePublished(article)} className={textMuted + ' hover:text-amber-700'}>
                  {article.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => startEdit(article)} className={`${textMuted} hover:text-amber-700`}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticleStudio;
