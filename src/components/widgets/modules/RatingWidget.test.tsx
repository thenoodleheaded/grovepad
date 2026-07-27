import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RatingData } from '../../../types/spatial'
import { RatingWidget } from './RatingWidget'
import type { RatingSkinMode } from './ratingSkinModel'

const SKINS = [
  'stars',
  'slider',
  'emoji',
  'traffic_light',
  'nps',
  'rubric',
  'confidence',
] as const

function render(skin: RatingSkinMode, data: Partial<RatingData> = {}) {
  return renderToStaticMarkup(
    <RatingWidget
      skin={skin}
      data={{ label: 'How did it go?', value: 4, skin, ...data }}
      onChange={() => undefined}
    />,
  )
}

describe('purpose-built Rating skins', () => {
  it.each([
    ['stars', 'gp-rating-stars'],
    ['slider', 'gp-rating-slider-wrap'],
    ['emoji', 'gp-rating-emojis'],
    ['traffic_light', 'gp-rating-traffic'],
    ['nps', 'gp-rating-nps'],
    ['rubric', 'gp-rating-rubric'],
    ['confidence', 'gp-rating-confidence-ring'],
  ] as const)('renders the %s experience with its own anatomy', (skin, className) => {
    expect(render(skin)).toContain(className)
  })

  it.each(SKINS)('keeps the shared rating visible in the %s skin', (skin) => {
    const markup = render(skin, { value: 3.5 })
    expect(markup).toMatch(/3\.5|7 \/ 10|Passive/)
  })

  it('presents all five feelings as named, keyboard-efficient choices', () => {
    const markup = render('emoji')
    for (const word of ['Awful', 'Poor', 'Okay', 'Good', 'Amazing']) {
      expect(markup).toContain(word)
    }
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1)
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(4)
  })

  it('labels every NPS score and exposes one selected radio', () => {
    const markup = render('nps', { value: 4.5 })
    expect(markup.match(/role="radio"/g)).toHaveLength(11)
    expect(markup.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(markup).toContain('Promoter')
  })

  it('renders rubric criteria as real editable rows with one published value', () => {
    const markup = render('rubric', {
      value: 4.2,
      skinStates: {
        rubric: {
          criteria: [
            { id: 'quality', label: 'Quality', value: 4.5 },
            { id: 'fit', label: 'Fit', value: 4 },
          ],
        },
      },
    })
    expect(markup).toContain('value="Quality"')
    expect(markup).toContain('value="Fit"')
    expect(markup).toContain('Published average')
    expect(markup).toContain('Add criterion')
  })

  it('shows confidence as a bounded ring, slider, and evidence note', () => {
    const markup = render('confidence', {
      skinStates: { confidence: { percent: 82, evidence: 'Three user tests' } },
    })
    expect(markup).toContain('82')
    expect(markup).toContain('Three user tests')
    expect(markup).toContain('aria-label="Confidence card rating from 0 to 5"')
    expect(markup).toContain('aria-label="Confidence percent"')
  })

  // Article XIX: each text control sits directly on the card backplate.
  it.each(SKINS)('keeps the %s text controls off a second glass island', (skin) => {
    const markup = render(skin)
    const chunks = markup.split('<input').slice(0, -1)
    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(chunk.slice(chunk.lastIndexOf('<div')), `${skin} input wrapper`)
        .toContain('gp-bare-field')
    }
  })
})
