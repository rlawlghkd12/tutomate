import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '@tutomate/core/src/utils/dayjs'
import '@tutomate/ui/src/index.css'
import './globals.css'
import App from './App.tsx'
import { errorHandler, logInfo, logError } from '@tutomate/core'

window.addEventListener('error', (event) => {
  logError('Uncaught error', { error: event.error });
  errorHandler.handle(event.error);
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  logError('Unhandled promise rejection', { error: event.reason });
  errorHandler.handle(event.reason);
  event.preventDefault();
});

logInfo('Application initializing');

function Root() {
  useEffect(() => {
    logInfo('Application mounted');
  }, []);

  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />)
