import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Lab from './lab/Lab.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
