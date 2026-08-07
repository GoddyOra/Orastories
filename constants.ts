// Book catalog and manuscripts now live in Supabase, not in this file.
// See lib/books.ts for the fetch logic and db/schema.sql for the schema.
export type { BookCatalogItem } from './lib/books';
export { fetchBookCatalog } from './lib/books';
