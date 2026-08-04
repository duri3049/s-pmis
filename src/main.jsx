import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// 서비스 워커는 로그인 여부와 무관하게 최대한 일찍 등록한다.
// (예전에는 로그인 후 푸시 설정 과정에서만 등록돼, 그 전에는 오프라인 캐시가 없었다)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* 등록 실패해도 앱 동작에는 지장 없음 */ });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
