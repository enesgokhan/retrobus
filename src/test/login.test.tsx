import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from '../lib/auth'
import Login from '../routes/Login'
import { S } from '../lib/strings'

describe('Login', () => {
  it('renders the boarding form in Turkish', () => {
    render(
      <HashRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </HashRouter>,
    )
    expect(screen.getByText(S.appName)).toBeInTheDocument()
    expect(screen.getByText(S.loginTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: S.loginButton })).toBeDisabled()
  })
})
