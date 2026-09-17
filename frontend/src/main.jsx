import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import Shell from './components/Shell.jsx'
import Home from './pages/Home.jsx'
import AddProject from './pages/AddProject.jsx'
import Guide from './pages/Guide.jsx'
import Overview from './pages/Overview.jsx'
import Placeholder from './pages/Placeholder.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddProject />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/p/:projectId" element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="dependencies" element={<Placeholder title="Dependency graph" />} />
          <Route path="vulnerabilities" element={<Placeholder title="Vulnerabilities" />} />
          <Route path="simulation" element={<Placeholder title="Ripple simulation" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
