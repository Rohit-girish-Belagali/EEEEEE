import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import Shell from './components/Shell.jsx'
import Home from './pages/Home.jsx'
import AddProject from './pages/AddProject.jsx'
import Guide from './pages/Guide.jsx'
import Overview from './pages/Overview.jsx'
import Dependencies from './pages/Dependencies.jsx'
import Simulation from './pages/Simulation.jsx'
import Vulnerabilities from './pages/Vulnerabilities.jsx'
import Pitch from './pages/Pitch.jsx'
import { TeamList, TeamMember } from './pages/Team.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddProject />} />
        <Route path="/pitch" element={<Navigate to="/pitch/1" replace />} />
        <Route path="/pitch/:n" element={<Pitch />} />
        <Route path="/team" element={<TeamList />} />
        <Route path="/team/:slug" element={<TeamMember />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/p/:projectId" element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="dependencies" element={<Dependencies />} />
          <Route path="vulnerabilities" element={<Vulnerabilities />} />
          <Route path="simulation" element={<Simulation />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
