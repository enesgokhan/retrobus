import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { S } from './lib/strings'
import Login from './routes/Login'
import Katil from './routes/Katil'
import Room from './routes/Room'
import Sunum from './routes/Sunum'
import Host from './routes/host/Host'
import Members from './routes/host/Members'
import Profil from './routes/Profil'
import Yearbook from './routes/Yearbook'
import Kurallar from './routes/Kurallar'
import Tani from './routes/Tani'
import Tasarim from './routes/Tasarim'

function Splash() {
  return (
    <main className="min-h-dvh grid place-items-center">
      <div className="text-center animate-fade">
        <div className="text-5xl mb-4 leading-none" aria-hidden>
          🚌
        </div>
        <p className="text-subhead text-label-2">{S.loading}</p>
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
      {/* joining by room code needs no prior identity, so it sits outside the
          signed-in routes entirely */}
      <Route path="/kat/:code" element={<Katil />} />
      <Route
        path="/oda"
        element={
          <RequireMember>
            <Room />
          </RequireMember>
        }
      />
      <Route
        path="/profil"
        element={
          <RequireMember>
            <Profil />
          </RequireMember>
        }
      />
      <Route
        path="/yillik"
        element={
          <RequireMember>
            <Yearbook />
          </RequireMember>
        }
      />
      <Route
        path="/kurallar"
        element={
          <RequireMember>
            <Kurallar />
          </RequireMember>
        }
      />
      <Route
        path="/tani"
        element={
          <RequireMember>
            <Tani />
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
      {/* the design workbench: every component in every state, unlinked */}
      <Route path="/tasarim" element={<Tasarim />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
