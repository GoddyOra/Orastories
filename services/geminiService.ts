
// NOTE: @google/genai is a server-side SDK and should not be imported in
// browser bundles. Importing it at module top-level prevents Vite from
// serving the app in development. Keep the frontend service as a tiny
// shim that returns a helpful message and let developers implement a
// server-side proxy (or API route) that uses the GenAI SDK.

export class GeminiService {
  constructor() {}

  async discussChapter(_chapterContent: string, _userQuery: string) {
    // Runtime environments in the browser cannot call the official
    // Google GenAI SDK directly. Return a friendly fallback so the
    // UI remains usable. Implement a server-side endpoint to proxy
    // requests to Google GenAI and call that from the frontend.
    console.warn('GeminiService: running in browser; AI calls disabled.');
    return "AI features are disabled in the browser. Configure a server-side proxy using @google/genai and update the frontend to call it.";
  }
}
