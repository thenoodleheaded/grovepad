import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DeployUpdateBanner, DeployUpdateNotice } from './DeployUpdateBanner'

describe('DeployUpdateBanner', () => {
  it('stays absent until a newer build is confirmed', () => {
    expect(renderToStaticMarkup(<DeployUpdateBanner />)).toBe('')
  })

  it('offers a non-dismissible refresh action for a newer build', () => {
    const markup = renderToStaticMarkup(<DeployUpdateNotice />)
    expect(markup).toContain('data-deploy-update-banner="true"')
    expect(markup).toContain('A newer Grovepad build is ready.')
    expect(markup).toContain('Refresh')
  })
})
