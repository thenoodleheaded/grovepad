import { useEffect, useState } from 'react'
import { Image } from 'lucide-react'
import type { MediaData } from '../../../types/spatial'
import { useFieldAnchor } from '../../../hooks/useFieldAnchor'

interface MediaWidgetProps {
  data: MediaData
  onChange: (data: MediaData) => void
}

/** A single image by URL with a caption. Broken URLs fall back gracefully. */
export function MediaWidget({ data, onChange }: MediaWidgetProps) {
  const [failed, setFailed] = useState(false)
  const [localUrl, setLocalUrl] = useState('')
  useEffect(() => {
    if (!data.localBlobKey) { setLocalUrl(''); return }
    let objectUrl = ''
    void import('../../../utils/boardDatabase').then(({ readMediaBlob }) => readMediaBlob(data.localBlobKey!)).then((blob) => {
      if (blob) { objectUrl = URL.createObjectURL(blob); setLocalUrl(objectUrl) }
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [data.localBlobKey])
  const imageUrl = localUrl || data.url
  const showImage = imageUrl.trim() !== '' && !failed
  const urlRef = useFieldAnchor<HTMLInputElement>('url')
  const captionRef = useFieldAnchor<HTMLInputElement>('caption')

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border gp-hairline bg-neutral-950/60">
        {showImage ? (
          <img
            src={imageUrl}
            alt={data.altText || data.caption || 'Media'}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full select-none object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-neutral-700">
            <Image size={20} aria-hidden />
            <span className="text-[10px]">{failed ? "Couldn't load image" : 'Paste an image URL below'}</span>
          </div>
        )}
      </div>

      <input
        ref={urlRef}
        value={data.url}
        placeholder="https://image…"
        aria-label="Image URL"
        onChange={(e) => {
          setFailed(false)
          onChange({ ...data, url: e.target.value })
        }}
        className="w-full shrink-0 bg-transparent font-mono text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
      />
      <input
        value={data.altText ?? ''}
        placeholder="Alt text for accessibility…"
        aria-label="Image alt text"
        onChange={(e) => onChange({ ...data, altText: e.target.value })}
        className="w-full shrink-0 bg-transparent text-[10px] text-neutral-500 outline-none placeholder:text-neutral-700"
      />
      <input
        ref={captionRef}
        value={data.caption}
        placeholder="Caption…"
        aria-label="Caption"
        onChange={(e) => onChange({ ...data, caption: e.target.value })}
        className="w-full shrink-0 bg-transparent text-[12px] text-neutral-300 outline-none placeholder:text-neutral-700"
      />
    </div>
  )
}
