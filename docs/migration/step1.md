# Step 1 — Upload canonical originals

This document explains how to upload canonical book files (PDF/EPUB/TXT) to object storage (S3-compatible) and how the accompanying upload script works.

Prerequisites
- Node 18+ (or an environment that supports ESM)
- An S3 bucket and AWS credentials with PutObject permissions
- Files placed in the `originals/` folder at the repo root

Usage
1. Copy `.env.example` to `.env` and fill the values.
2. Install dependencies:

```bash
npm install
```

3. Upload everything in `originals/`:

```bash
npm run upload:originals
```

4. Or upload a single file:

```bash
node ./scripts/upload_originals.js originals/my-book.pdf
```

Notes and recommendations
- Prefer a private bucket and use signed URLs or CDN rules for serving.
- Consider using Git LFS only for small teams; S3 (or a managed asset store) is better for large binaries.
- After upload, record canonical URIs (S3 keys or CDN URLs) in a lightweight metadata file inside the app (e.g., `data/books.json`).
