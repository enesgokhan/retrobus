import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { S } from './lib/strings'
import Login from './routes/Login'
import Room from './routes/Room'
import Sunum from './routes/Sunum'
import Host from './routes/host/Host'
import Members from './routes/host/Members'

function Splash() {
  return (
    <main className="min-h-dvh grid place-items-center">
      <div className="text-center">
        <div className="text-6xl mb-3 animate-bounce" aria-hidden>
          🚌
        </div>
        <p className="text-ink-soft font-semibold">{S.loading}</p>
      </div>
    </main>
  )
}

function RequireMember({ children }: { children: ReactNode }) {
  const { member, loading } = useAuth()
  if (loading) return <Splash />
  if (!member) return <Navigate to="/" replace />
  return children
}

function RequireHost({ children }: { children: ReactNode }) {
  const { member, loading } = useAuth()
  if (loading) return <Splash />
  if (!member) return <Navigate to="/" replace />
  if (!member.is_host) return <Navigate to="/oda" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/oda"
        element={
          <RequireMember>
            <Room />
          </RequireMember>
        }
      />
      <Route
        path="/sunum"
        element={
          <RequireMember>
            <Sunum />
          </RequireMember>
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
