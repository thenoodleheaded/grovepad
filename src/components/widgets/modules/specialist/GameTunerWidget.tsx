import type { GameTunerData } from '../../../../types/spatial'
import { useFieldAnchor } from '../../../../hooks/useFieldAnchor'

interface GameTunerWidgetProps {
  data: GameTunerData
  onChange: (data: GameTunerData) => void
}

export function GameTunerWidget({ data, onChange }: GameTunerWidgetProps) {
  const gripRef = useFieldAnchor('grip')
  const driftRef = useFieldAnchor('drift')
  const stabilityRef = useFieldAnchor('stability')

  const updateAttribute = (key: keyof GameTunerData, value: number) => {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="gp-island space-y-3 p-3">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-semibold text-neutral-400">Tuner Matrix</span>
        <span className="gp-label">Live Config</span>
      </div>

      <div className="space-y-2.5">
        {/* Grip */}
        <div ref={gripRef} className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-400 font-medium">Grip Coefficient</span>
            <span className="font-mono text-emerald-400">{data.grip}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={data.grip}
            aria-label="Grip percentage"
            onChange={(e) => updateAttribute('grip', Number(e.target.value))}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>

        {/* Drift */}
        <div ref={driftRef} className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-400 font-medium">Drift Yaw Angle</span>
            <span className="font-mono text-amber-400">{data.drift}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={90}
            value={data.drift}
            aria-label="Drift angle"
            onChange={(e) => updateAttribute('drift', Number(e.target.value))}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Stability */}
        <div ref={stabilityRef} className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-neutral-400 font-medium">Suspension Stability</span>
            <span className="font-mono text-sky-400">{data.stability}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={data.stability}
            aria-label="Stability percentage"
            onChange={(e) => updateAttribute('stability', Number(e.target.value))}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>
      </div>

      {/* Visual matrix display bar */}
      <div className="gp-well relative mt-2 flex h-16 w-full items-end justify-center overflow-hidden pb-2">
        <div className="flex gap-2 items-end justify-center w-full px-4 h-10">
          <div className="bg-emerald-500/80 w-3 rounded-t" style={{ height: `${data.grip}%` }} />
          <div className="bg-amber-500/80 w-3 rounded-t" style={{ height: `${(data.drift / 90) * 100}%` }} />
          <div className="bg-sky-500/80 w-3 rounded-t" style={{ height: `${data.stability}%` }} />
        </div>
      </div>
    </div>
  )
}
