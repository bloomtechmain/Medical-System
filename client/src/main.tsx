import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { initErrorTracking, captureError } from './errorTracking';
import './i18n';
import './index.css';

// MON-05: before the app renders, so a crash during the first render is
// reported too.
initErrorTracking();

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  // The boundary already stopped this error from reaching window.onerror, so
  // without an explicit report the tracker would never hear about the crashes
  // that matter most — the ones that blank the screen for the user.
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: 800 }}>
          <h2 style={{ color: '#dc2626' }}>Application Error</h2>
          <pre style={{ background: '#fee2e2', padding: '1rem', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {err.message}
          </pre>
          <button onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <SocketProvider>
              <App />
              <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
