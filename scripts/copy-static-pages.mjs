import { copyFile, cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const staticPages = [
  'about.html',
  'blog.html',
  'blog-best-programming-language-2026.html',
  'blog-perfect-food-menu-pet-dog-2026.html',
  'blog-python-syntaxerror-unexpected-eof-guide-2026.html',
  'blog-writing-101-profitable-writer-2026.html',
  'books.html',
  'reviews.html',
  'contact.html'
];

const copyStaticPages = async () => {
  for (const fileName of staticPages) {
    await copyFile(path.join(rootDir, fileName), path.join(distDir, fileName));
  }
};

const copyNavigationScript = async () => {
  const distScriptsDir = path.join(distDir, 'scripts');
  await mkdir(distScriptsDir, { recursive: true });
  await copyFile(
    path.join(rootDir, 'scripts', 'navigation.js'),
    path.join(distScriptsDir, 'navigation.js')
  );
};

const copyImages = async () => {
  await cp(path.join(rootDir, 'images'), path.join(distDir, 'images'), {
    recursive: true,
    force: true
  });
};

await copyStaticPages();
await copyNavigationScript();
await copyImages();
