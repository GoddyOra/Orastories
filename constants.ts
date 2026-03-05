import { Book } from './types';
import { MILE_HIGH_CLUB } from './book-mile-high-club';
import { WHEN_LOVE_STARTS_TO_HURT } from './book-when-love-starts-to-hurt';
import { LUST_AND_LIES } from './book-lust-and-lies';

/**
 * Registry of all available books in the archive.
 * To add a new book, create a dedicated 'book-[name].ts' file
 * and import the instance here.
 */
export const BOOKS: Book[] = [
  MILE_HIGH_CLUB,
  WHEN_LOVE_STARTS_TO_HURT,
  LUST_AND_LIES
];
