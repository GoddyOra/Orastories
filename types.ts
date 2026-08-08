
export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string;
  synopsis: string;
  chapters: Chapter[];
  genre: string;
  publishedDate: string;
}

export type ThemeMode = 'light' | 'dark' | 'sepia';

export interface ReadingSettings {
  theme: ThemeMode;
  fontSize: number;
  lineHeight: number;
}

export interface Profile {
  id: string;
  role: 'creator' | 'reader';
  displayName: string | null;
  username: string | null;
  createdAt: string;
}

export type CreatorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface CreatorApplication {
  id: string;
  userId: string;
  message: string | null;
  status: CreatorApplicationStatus;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  readerId: string;
  bookId: string;
  chapterId: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  bookId: string;
  readerId: string;
  rating: number;
  body: string | null;
  createdAt: string;
}
