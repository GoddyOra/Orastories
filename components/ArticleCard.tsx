import React from 'react';
import { ThemeMode } from '../types';
import { ArticleSummary } from '../lib/articles';

interface ArticleCardProps {
  article: ArticleSummary;
  theme: ThemeMode;
  onSelect: (slug: string) => void;
  onSelectCreator: (username: string) => void;
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article, theme, onSelect, onSelectCreator }) => {
  const isLight = theme !== 'dark';
  const cardCls = isLight ? 'bg-white border-black/10' : 'bg-[#161616] border-white/10';
  const textMuted = isLight ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className={`rounded-sm border overflow-hidden transition-all duration-300 hover:shadow-lg ${cardCls}`}>
      <button onClick={() => onSelect(article.slug)} className="block w-full text-left">
        {article.coverImageUrl && (
          <div className="aspect-[16/9] overflow-hidden">
            <img src={article.coverImageUrl} alt={article.coverImageAlt || article.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="p-5">
          <h3 className={`text-xl font-['Playfair_Display'] font-bold mb-2 ${isLight ? 'text-gray-900' : 'text-white'}`}>{article.title}</h3>
          {article.averageRating ? (
            <p className={`text-xs uppercase tracking-[0.15em] ${textMuted}`}>
              {article.averageRating.toFixed(1)} ★ ({article.ratingCount})
            </p>
          ) : null}
        </div>
      </button>
      <div className="px-5 pb-5">
        <p className={`text-xs ${textMuted}`}>
          By{' '}
          {article.author.isCreator ? (
            <a
              href={`/${article.author.username}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelectCreator(article.author.username);
              }}
              className={isLight ? 'hover:text-amber-700' : 'hover:text-amber-400'}
            >
              {article.author.displayName || article.author.username}
            </a>
          ) : (
            article.author.displayName || article.author.username
          )}
        </p>
      </div>
    </div>
  );
};

export default ArticleCard;
