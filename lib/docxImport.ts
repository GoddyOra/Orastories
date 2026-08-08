import { extractRawText } from 'mammoth';

export interface DraftChapter {
  title: string;
  content: string;
}

// mammoth joins paragraphs with a blank line, matching the Reader's
// chapter.content.split('\n\n') rendering exactly.
const CHAPTER_MARKER = /^chapter\s+\S+\s*$/i;

export function splitIntoChapters(text: string): DraftChapter[] {
  const lines = text.split('\n');
  const chapters: DraftChapter[] = [];
  let currentTitle = 'Chapter One';
  let currentLines: string[] = [];

  const flush = () => {
    if (currentLines.some((line) => line.trim())) {
      chapters.push({ title: currentTitle, content: currentLines.join('\n').trim() });
    }
  };

  for (const line of lines) {
    if (CHAPTER_MARKER.test(line.trim())) {
      flush();
      currentTitle = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  // No recognized chapter markers anywhere in the document - fall back to
  // the whole thing as a single chapter rather than losing content.
  return chapters.length > 0 ? chapters : [{ title: 'Chapter One', content: text.trim() }];
}

export async function parseDocxToChapters(file: File): Promise<DraftChapter[]> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await extractRawText({ arrayBuffer });
  return splitIntoChapters(result.value);
}
