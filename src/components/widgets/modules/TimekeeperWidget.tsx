import type { TimekeeperData, TimekeeperMode } from '../../../types/spatial'
import { PomodoroWidget } from './PomodoroWidget'
import { StopwatchWidget } from './StopwatchWidget'
import { TimerWidget } from './TimerWidget'

const MODE_LABELS: Record<TimekeeperMode, string> = {
  countdown: 'Countdown',
  pomodoro: 'Pomodoro',
  stopwatch: 'Stopwatch',
}

export function TimekeeperWidget({ data, onChange }: { data: TimekeeperData; onChange: (data: TimekeeperData) => void }) {
  return <div className="flex h-full flex-col gap-2">
    <label className="gp-subdivision flex shrink-0 items-center gap-2 rounded-xl border gp-hairline px-2 py-1.5">
      <span className="gp-label shrink-0">Mode</span>
      <select aria-label="Timer mode" value={data.mode} onChange={event=>onChange({...data,mode:event.target.value as TimekeeperMode})} className="min-w-0 flex-1 bg-transparent text-right text-[10px] font-semibold text-neutral-300 outline-none">
        {(Object.keys(MODE_LABELS) as TimekeeperMode[]).map(mode=><option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
      </select>
    </label>
    <div className="min-h-0 flex-1">
      {data.mode==='countdown'&&<TimerWidget data={data.countdown} onChange={countdown=>onChange({...data,countdown})}/>} 
      {data.mode==='pomodoro'&&<PomodoroWidget data={data.pomodoro} onChange={pomodoro=>onChange({...data,pomodoro})}/>} 
      {data.mode==='stopwatch'&&<StopwatchWidget data={data.stopwatch} onChange={stopwatch=>onChange({...data,stopwatch})}/>} 
    </div>
  </div>
}
