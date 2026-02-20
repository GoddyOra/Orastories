
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
