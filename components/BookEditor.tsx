import React, { useEffect, useState } from 'react';
import { ThemeMode } from '../types';
import {
  CreatorBook,
  CreatorChapter,
  addChapter,
  addChaptersBulk,
  deleteChapter,
  getReadCountForBook,
  listChaptersForBook,
  setBookPrice,
  setPublished,
  updateBook,
  updateChapter
} from '../lib/creatorBooks';
import { parseDocxToChapters, DraftChapter } from '../lib/docxImport';
import { uploadBookPdf, getBookPdfStatus } from '../lib/purchases';

interface BookEditorProps {
  theme: ThemeMode;
  book: CreatorBook;
  onBack: () => void;
  onChange: () => void;
}

const BookEditor: React.FC<BookEditorProps> = ({ theme, book, onBack, onChange }) => {
  const isLight = theme !== 'dark';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';
  const inputCls = `w-full px-4 py-3 rounded-sm border text-sm focus:outline-none focus:border-amber-700 ${
    isLight ? 'bg-white border-black/15 text-gray-900' : 'bg-[#0f0f0f] border-white/15 text-white'
  }`;
  const cardCls = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';

  const [fields, setFields] = useState({
    title: book.title,
    author: book.author,
    genre: book.genre,
    synopsis: book.synopsis,
    cover: book.cover,
    publishedDate: book.publishedDate
  });
  const [isPublished, setIsPublished] = useState(book.isPublished);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);

  const [priceInput, setPriceInput] = useState(book.priceCents != null ? (book.priceCents / 100).toFixed(2) : '');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSaved, setPriceSaved] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [hasPdf, setHasPdf] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    getBookPdfStatus(book.id)
      .then(setHasPdf)
      .catch((error) => console.error('Failed to check PDF status:', error));
  }, [book.id]);

  const [chapters, setChapters] = useState<CreatorChapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [readCount, setReadCount] = useState<number | null>(null);

  const [editingChapterId, setEditingChapterId] = useState<string | 'new' | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  const [importDrafts, setImportDrafts] = useState<DraftChapter[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [savingImport, setSavingImport] = useState(false);

  const loadChapters = () => {
    setChaptersLoading(true);
    listChaptersForBook(book.id)
      .then(setChapters)
      .catch((error) => console.error('Failed to load chapters:', error))
      .finally(() => setChaptersLoading(false));
  };

  useEffect(() => {
    loadChapters();
    getReadCountForBook(book.id)
      .then(setReadCount)
      .catch((error) => console.error('Failed to load read count:', error));
  }, [book.id]);

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    setMetaSaved(false);
    try {
      await updateBook(book.id, fields);
      setMetaSaved(true);
      onChange();
    } catch (error) {
      console.error('Failed to save book details:', error);
    } finally {
      setSavingMeta(false);
    }
  };

  const handleTogglePublished = async () => {
    const next = !isPublished;
    try {
      await setPublished(book.id, next);
      setIsPublished(next);
      onChange();
    } catch (error) {
      console.error('Failed to update published state:', error);
    }
  };

  const handleSavePrice = async () => {
    setPriceError(null);
    const trimmed = priceInput.trim();
    const priceCents = trimmed === '' ? null : Math.round(parseFloat(trimmed) * 100);

    if (priceCents !== null && (!Number.isInteger(priceCents) || (priceCents !== 0 && priceCents < 50))) {
      setPriceError('Price must be $0.00 (free, unlocked with a free account) or at least $0.50, or left blank to keep this book not for sale.');
      return;
    }

    setSavingPrice(true);
    setPriceSaved(false);
    try {
      await setBookPrice(book.id, priceCents);
      setPriceSaved(true);
      onChange();
    } catch (error) {
      setPriceError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setSavingPrice(false);
    }
  };

  const handlePdfSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPdfError(null);
    setUploadingPdf(true);
    try {
      await uploadBookPdf(book.id, file);
      setHasPdf(true);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Failed to upload PDF.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const startNewChapter = () => {
    setEditingChapterId('new');
    setChapterTitle('');
    setChapterContent('');
  };

  const startEditChapter = (chapter: CreatorChapter) => {
    setEditingChapterId(chapter.id);
    setChapterTitle(chapter.title);
    setChapterContent(chapter.content);
  };

  const handleSaveChapter = async () => {
    if (!chapterTitle.trim()) return;
    setSavingChapter(true);
    try {
      if (editingChapterId === 'new') {
        await addChapter(book.id, chapterTitle, chapterContent);
      } else if (editingChapterId) {
        await updateChapter(editingChapterId, chapterTitle, chapterContent);
      }
      setEditingChapterId(null);
      loadChapters();
    } catch (error) {
      console.error('Failed to save chapter:', error);
    } finally {
      setSavingChapter(false);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    try {
      await deleteChapter(chapterId);
      loadChapters();
    } catch (error) {
      console.error('Failed to delete chapter:', error);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const drafts = await parseDocxToChapters(file);
      setImportDrafts(drafts);
    } catch (error) {
      console.error('Failed to parse DOCX:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveImport = async () => {
    if (!importDrafts) return;
    setSavingImport(true);
    try {
      await addChaptersBulk(book.id, importDrafts);
      setImportDrafts(null);
      loadChapters();
    } catch (error) {
      console.error('Failed to save imported chapters:', error);
    } finally {
      setSavingImport(false);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className={`mb-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.12em] font-semibold ${textMuted} hover:text-amber-700`}
      >
        <span className="text-base leading-none">←</span> My Books
      </button>

      <div className="flex items-center justify-between mb-8">
        <h2 className={`text-2xl font-['Playfair_Display'] ${isLight ? 'text-gray-900' : 'text-white'}`}>
          {book.title}
        </h2>
        <div className="flex items-center gap-4">
          {readCount !== null && (
            <span className={`text-xs uppercase tracking-[0.15em] ${textMuted}`}>{readCount} reads</span>
          )}
          <button
            onClick={handleTogglePublished}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border transition-all ${
              isPublished
                ? 'border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white'
                : `border-current ${textMuted} hover:text-amber-700`
            }`}
          >
            {isPublished ? 'Published' : 'Draft — Publish'}
          </button>
        </div>
      </div>

      {/* Book metadata */}
      <div className={`rounded-sm border p-6 sm:p-8 mb-10 ${cardCls}`}>
        <div className="space-y-4">
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Title</label>
            <input className={inputCls} value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Author</label>
              <input className={inputCls} value={fields.author} onChange={(e) => setFields({ ...fields, author: e.target.value })} />
            </div>
            <div>
              <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Genre</label>
              <input className={inputCls} value={fields.genre} onChange={(e) => setFields({ ...fields, genre: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Cover Image URL</label>
            <input className={inputCls} value={fields.cover} onChange={(e) => setFields({ ...fields, cover: e.target.value })} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Published Year</label>
            <input className={inputCls} value={fields.publishedDate} onChange={(e) => setFields({ ...fields, publishedDate: e.target.value })} />
          </div>
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>Synopsis</label>
            <textarea
              rows={3}
              className={inputCls}
              value={fields.synopsis}
              onChange={(e) => setFields({ ...fields, synopsis: e.target.value })}
            />
          </div>
          <button
            onClick={handleSaveMeta}
            disabled={savingMeta}
            className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
          >
            {savingMeta ? 'Saving...' : metaSaved ? 'Saved' : 'Save Details'}
          </button>
        </div>
      </div>

      {/* Sell the Full PDF */}
      <div className={`rounded-sm border p-6 sm:p-8 mb-10 ${cardCls}`}>
        <h3 className={`text-xs uppercase tracking-[0.3em] mb-4 ${textMuted}`}>Sell the Full PDF</h3>
        <div className="space-y-4">
          <div>
            <label className={`block text-[10px] uppercase tracking-[0.2em] mb-2 ${textMuted}`}>
              Price (USD) — leave blank for not for sale, enter 0 for a free claim (readers unlock the full book after signing in), or at least 0.50 for a real price
            </label>
            <input
              className={inputCls}
              placeholder="4.99"
              inputMode="decimal"
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setPriceSaved(false);
              }}
            />
          </div>
          {priceError && <p className="text-sm text-red-500">{priceError}</p>}
          <button
            onClick={handleSavePrice}
            disabled={savingPrice}
            className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
          >
            {savingPrice ? 'Saving...' : priceSaved ? 'Saved' : 'Save Price'}
          </button>

          <div className="pt-4 flex items-center gap-4">
            <label className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-current cursor-pointer hover:text-amber-700">
              {uploadingPdf ? 'Uploading...' : hasPdf ? 'Replace PDF' : 'Upload PDF'}
              <input type="file" accept=".pdf" className="hidden" onChange={handlePdfSelected} disabled={uploadingPdf} />
            </label>
            <span className={`text-xs uppercase tracking-[0.15em] ${hasPdf ? 'text-amber-700' : textMuted}`}>
              {hasPdf ? 'PDF uploaded ✓' : 'No PDF uploaded yet'}
            </span>
          </div>
          {pdfError && <p className="text-sm text-red-500">{pdfError}</p>}
        </div>
      </div>

      {/* Chapters */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-xs uppercase tracking-[0.3em] ${textMuted}`}>Chapters</h3>
          <div className="flex items-center gap-3">
            <label className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-current cursor-pointer hover:text-amber-700">
              {importing ? 'Reading file...' : 'Upload .docx'}
              <input type="file" accept=".docx" className="hidden" onChange={handleFileSelected} disabled={importing} />
            </label>
            <button
              onClick={startNewChapter}
              className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] border border-amber-700 text-amber-700 hover:bg-amber-700 hover:text-white transition-all"
            >
              Add Chapter
            </button>
          </div>
        </div>

        {chaptersLoading ? (
          <p className={`text-sm ${textMuted}`}>Loading chapters...</p>
        ) : chapters.length === 0 ? (
          <p className={`text-sm ${textMuted}`}>No chapters yet.</p>
        ) : (
          <div className="space-y-2">
            {chapters.map((chapter) => (
              <div key={chapter.id} className={`flex items-center justify-between rounded-sm border p-4 ${cardCls}`}>
                <span className={`text-sm ${isLight ? 'text-gray-900' : 'text-white'}`}>{chapter.title}</span>
                <div className="flex items-center gap-4 text-xs uppercase tracking-[0.15em]">
                  <button onClick={() => startEditChapter(chapter)} className={`${textMuted} hover:text-amber-700`}>Edit</button>
                  <button onClick={() => handleDeleteChapter(chapter.id)} className={`${textMuted} hover:text-red-500`}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chapter editor */}
      {editingChapterId && (
        <div className={`rounded-sm border p-6 sm:p-8 mb-10 ${cardCls}`}>
          <h3 className={`text-xs uppercase tracking-[0.3em] mb-4 ${textMuted}`}>
            {editingChapterId === 'new' ? 'New Chapter' : 'Edit Chapter'}
          </h3>
          <div className="space-y-4">
            <input
              className={inputCls}
              placeholder="Chapter title"
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
            />
            <textarea
              rows={16}
              className={`${inputCls} font-serif leading-relaxed`}
              placeholder="Chapter text. Leave a blank line between paragraphs."
              value={chapterContent}
              onChange={(e) => setChapterContent(e.target.value)}
            />
            <div className="flex gap-3">
              <button
                onClick={handleSaveChapter}
                disabled={savingChapter || !chapterTitle.trim()}
                className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
              >
                {savingChapter ? 'Saving...' : 'Save Chapter'}
              </button>
              <button
                onClick={() => setEditingChapterId(null)}
                className={`px-6 py-3 border border-current text-[10px] font-bold uppercase tracking-[0.3em] ${textMuted}`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCX import review */}
      {importDrafts && (
        <div className={`rounded-sm border p-6 sm:p-8 mb-10 ${cardCls}`}>
          <h3 className={`text-xs uppercase tracking-[0.3em] mb-2 ${textMuted}`}>
            Review Imported Chapters ({importDrafts.length})
          </h3>
          <p className={`text-sm mb-6 ${textMuted}`}>
            Edit anything below before saving — nothing is added to the book yet.
          </p>
          <div className="space-y-6">
            {importDrafts.map((draft, i) => (
              <div key={i} className="space-y-2">
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => {
                    const next = [...importDrafts];
                    next[i] = { ...next[i], title: e.target.value };
                    setImportDrafts(next);
                  }}
                />
                <textarea
                  rows={8}
                  className={`${inputCls} font-serif leading-relaxed`}
                  value={draft.content}
                  onChange={(e) => {
                    const next = [...importDrafts];
                    next[i] = { ...next[i], content: e.target.value };
                    setImportDrafts(next);
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSaveImport}
              disabled={savingImport}
              className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all disabled:opacity-50"
            >
              {savingImport ? 'Saving...' : `Save ${importDrafts.length} Chapter${importDrafts.length > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => setImportDrafts(null)}
              className={`px-6 py-3 border border-current text-[10px] font-bold uppercase tracking-[0.3em] ${textMuted}`}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookEditor;
