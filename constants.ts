import { Book } from './types';

export interface BookCatalogItem {
  id: string;
  title: string;
  author: string;
  cover: string;
  synopsis: string;
  genre: string;
  publishedDate: string;
  loadBook: () => Promise<Book>;
}

/**
 * Registry of all available books in the archive.
 * To add a new book, create a dedicated 'book-[name].ts' file
 * and import the instance here.
 */
export const BOOKS: BookCatalogItem[] = [
  {
    id: 'mile-high-club-2026',
    title: 'Mile High Club 2026',
    author: 'Goddy Ora',
    cover: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=800&auto=format&fit=crop',
    genre: 'Contemporary Romance',
    publishedDate: '2026',
    synopsis:
      'A high-stakes contemporary romance following Charlotte, an ambitious Air Force cadet, and Captain Marvel Mann, the legendary Thunderbird lead. Their story-full of heartbreak and healing, action and romance-has forged an unbreakable bond.',
    loadBook: async () => (await import('./book-mile-high-club')).MILE_HIGH_CLUB
  },
  {
    id: 'when-love-starts-to-hurt',
    title: 'When Love Starts to Hurt',
    author: 'Goddy Ora',
    cover: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=800&auto=format&fit=crop',
    genre: 'Self-Help / Psychology',
    publishedDate: '2025',
    synopsis:
      'A comprehensive guide to recognizing emotional abuse, breaking toxic patterns, and reclaiming self-worth through attachment theory, cognitive behavioral therapy, and healthy communication.',
    loadBook: async () => (await import('./book-when-love-starts-to-hurt')).WHEN_LOVE_STARTS_TO_HURT
  },
  {
    id: 'lust-and-lies-the-limond-affair',
    title: 'Lust & Lies: The Limond Affair',
    author: 'Goddy Ora',
    cover: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=800&auto=format&fit=crop',
    genre: 'Contemporary Romance / Legal Thriller',
    publishedDate: '2026',
    synopsis:
      'A high-stakes legal thriller and contemporary romance following Park Limond, a top defense attorney, and his wife Caroline. When Park is accused of murdering his mistress, Assistant District Attorney Bridgette Leah, the couple must navigate a web of lust, lies, and a powerful family conspiracy to find the truth and save their marriage.',
    loadBook: async () => (await import('./book-lust-and-lies')).LUST_AND_LIES
  }
];
