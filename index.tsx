
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { Sentry } from './lib/sentry';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#fcfaf7] text-[#1a1a1a] px-4">
          <div className="text-center max-w-sm">
            <h1 className="text-2xl font-['Playfair_Display'] mb-3">Something went wrong</h1>
            <p className="text-sm text-gray-600 mb-6">
              We've been notified and are looking into it. Reloading the page usually fixes this.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 border border-amber-700 text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-amber-700 hover:text-white transition-all"
            >
              Reload
            </button>
          </div>
        </div>
      }
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
