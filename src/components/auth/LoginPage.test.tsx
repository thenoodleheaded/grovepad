import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

describe('LoginPage field surfaces', () => {
  it('uses the shared field island for email and password', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup.match(/gp-field-island/g)).toHaveLength(2)
    expect(markup.match(/gp-input/g)).toHaveLength(2)
    expect(markup.match(/gp-login-input/g)).toHaveLength(2)
    expect(markup.match(/gp-login-action /g)).toHaveLength(2)
    expect(markup.match(/gp-login-provider/g)).toHaveLength(2)
    expect(markup).not.toContain('gp-hairline')
  })

  it('makes account creation and guest access single-surface glass islands', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).toContain('gp-island gp-login-action gp-login-action--secondary')
    expect(markup).toContain('gp-island gp-login-action gp-login-action--guest')
  })

  it('requires an account for a shared canvas link and explains editor approval', () => {
    const markup = renderToStaticMarkup(<LoginPage sharedCanvasLink />)

    expect(markup).toContain('Sign in or create an account to view this shared canvas.')
    expect(markup).toContain('the owner approves your email as an Editor')
    expect(markup).not.toContain('Continue as guest')
  })

  it('keeps the login card roomy and removes non-actionable marketing copy', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).toContain('max-w-md')
    expect(markup).toMatch(/gp-login-brand[\s\S]*gp-login-form-panel gp-panel/)
    expect(markup).not.toContain('gp-login-shell gp-pop gp-panel')
    expect(markup).not.toContain('Your infinite thinking canvas')
    expect(markup).not.toContain('Guest work saves')
  })

  it('offers Google and Apple sign-in on the website', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).not.toContain('coming soon')
    expect(markup).toContain('aria-label="Continue with Google"')
    expect(markup).toContain('aria-label="Continue with Apple"')
  })
  it('offers no Facebook or Microsoft sign-in', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).not.toContain('Facebook')
    expect(markup).not.toContain('Microsoft')
  })
})
