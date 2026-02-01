import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/dayjs' // dayjs 플러그인 전역 설정
import './index.css'
import App from './App.tsx'
import { errorHandler } from './utils/errors'
import { logInfo, logError } from './utils/logger'

// 전역 에러 핸들러 설정
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

// 앱 초기화 로그
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
