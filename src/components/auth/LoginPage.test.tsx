import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

describe('LoginPage field surfaces', () => {
  it('uses the shared field island for email and password', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup.match(/gp-field-island/g)).toHaveLength(2)
    expect(markup.match(/gp-input/g)).toHaveLength(2)
    expect(markup.match(/gp-login-action /g)).toHaveLength(2)
    expect(markup.match(/gp-login-provider/g)).toHaveLength(4)
    expect(markup).not.toContain('gp-hairline')
  })

  it('makes account creation and guest access single-surface glass islands', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).toContain('gp-island gp-login-action gp-login-action--secondary')
    expect(markup).toContain('gp-island gp-login-action gp-login-action--guest')
  })

  it('keeps the login card roomy and removes non-actionable marketing copy', () => {
    const markup = renderToStaticMarkup(<LoginPage />)

    expect(markup).toContain('max-w-md')
    expect(markup).not.toContain('Your infinite thinking canvas')
    expect(markup).not.toContain('Guest work saves')
  })
})
