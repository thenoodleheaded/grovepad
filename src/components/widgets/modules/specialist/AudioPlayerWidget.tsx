import { Play, Pause, Music } from 'lucide-react'
import type { AudioPlayerData } from '../../../../types/spatial'
import { useFieldAnchor } from '../../../../hooks/useFieldAnchor'

interface AudioPlayerWidgetProps {
  data: AudioPlayerData
  onChange: (data: AudioPlayerData) => void
}

export function AudioPlayerWidget({ data, onChange }: AudioPlayerWidgetProps) {
  const playingRef = useFieldAnchor<HTMLButtonElement>('playing')
  const bpmRef = useFieldAnchor('bpm')

  const togglePlay = () => {
    onChange({ ...data, isPlaying: !data.isPlaying })
  }

  const updateBpm = (bpm: number) => {
    onChange({ ...data, bpm: Math.min(250, Math.max(40, bpm)) })
  }

  const updateKey = (key: string) => {
    onChange({ ...data, key })
  }

  const updateSignalChain = (signalChain: string) => {
    onChange({ ...data, signalChain })
  }

  return (
    <div className="gp-island space-y-3 p-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold text-neutral-400">Synthesizer & Audio</span>
        <div className="flex items-center gap-1">
          <Music size={11} className="text-emerald-400" />
          <span className="gp-label">Stereo</span>
        </div>
      </div>

      {/* Waveform graphic element */}
      <div className="gp-well relative flex h-12 w-full items-center justify-between overflow-hidden px-2">
        <div className="flex items-center justify-center gap-0.5 w-full h-8 px-1">
          {Array.from({ length: 24 }).map((_, i) => {
            const baseHeight = Math.sin(i * 0.4) * 12 + 16
            const height = Math.max(4, baseHeight)
            return (
              <div
                key={i}
                style={{ height: `${height}px` }}
                className={`w-[3px] rounded-full transition-all duration-150 ${
                  data.isPlaying ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
              />
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          ref={playingRef}
          type="button"
          onClick={togglePlay}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            data.isPlaying
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {data.isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        {/* BPM & Key controls */}
        <div className="flex-1 grid grid-cols-2 gap-2">
          <div ref={bpmRef} className="space-y-0.5">
            <span className="gp-label">BPM</span>
            <input
              type="number"
              value={data.bpm}
              aria-label="BPM"
              onChange={(e) => updateBpm(Number(e.target.value))}
              className="gp-input w-full px-2 py-1 outline-none"
            />
          </div>
          <div className="space-y-0.5">
            <span className="gp-label">Key</span>
            <input
              type="text"
              value={data.key}
              aria-label="Musical key"
              onChange={(e) => updateKey(e.target.value)}
              className="gp-input w-full px-2 py-1 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Signal Chain Notes */}
      <div className="space-y-1">
        <span className="gp-label block">Signal Chain</span>
        <input
          type="text"
          value={data.signalChain}
          aria-label="Signal chain"
          onChange={(e) => updateSignalChain(e.target.value)}
          className="gp-input w-full px-2 py-1 outline-none"
          placeholder="Effects chain…"
        />
      </div>
    </div>
  )
}
