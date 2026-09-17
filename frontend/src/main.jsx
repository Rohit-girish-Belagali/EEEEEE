import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <main className="px-8 py-16 font-display text-6xl font-extrabold uppercase">RippleGuard</main>
  </StrictMode>,
)
