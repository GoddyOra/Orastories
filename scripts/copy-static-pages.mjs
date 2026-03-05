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
