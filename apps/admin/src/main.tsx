import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@tutomate/core/src/utils/dayjs'
import '@tutomate/ui/src/index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
