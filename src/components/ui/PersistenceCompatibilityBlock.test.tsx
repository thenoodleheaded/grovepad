import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PersistenceCompatibilityBlock } from './PersistenceCompatibilityBlock'

describe('PersistenceCompatibilityBlock', () => {
  it('makes a future local payload visibly non-writable', () => {
    const markup = renderToStaticMarkup(
      <PersistenceCompatibilityBlock block={{ foundVersion: 3, source: 'local' }} />,
    )

    expect(markup).toContain('data-persistence-compatibility-block="true"')
    expect(markup).toContain('Protected read-only state')
    expect(markup).toContain('format version 3')
    expect(markup).toContain('editing and saving are paused')
    expect(markup).toContain('Refresh Grovepad')
  })
})
