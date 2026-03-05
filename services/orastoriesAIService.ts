
// Browser bundles should not call provider SDKs directly.
// Keep this frontend service as a shim and route AI calls through
// a server-side API endpoint.

export class OrastoriesAIService {
  constructor() {}

  async discussChapter(_chapterContent: string, _userQuery: string) {
    console.warn('OrastoriesAIService: running in browser; AI calls disabled.');
    return 'AI features are disabled in the browser. Configure a server-side AI endpoint and update the frontend to call it.';
  }
}
