import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import Login from './routes/Login'
import Room from './routes/Room'
import Sunum from './routes/Sunum'
import Host from './routes/host/Host'
import Members from './routes/host/Members'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/" replace state={{ from: location }} />
  return children
}

function RequireHost({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/" replace />
  if (!session.member.is_host) return <Navigate to="/oda" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/oda"
        element={
          <RequireAuth>
            <Room />
          </RequireAuth>
        }
      />
      <Route
        path="/sunum"
        element={
          <RequireAuth>
            <Sunum />
          </RequireAuth>
        }
      />
      <Route
        path="/host"
        element={
          <RequireHost>
            <Host />
          </RequireHost>
        }
      />
      <Route
        path="/host/uyeler"
        element={
          <RequireHost>
            <Members />
          </RequireHost>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
