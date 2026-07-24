import type { TimekeeperData } from '../../../types/spatial'
import { PomodoroWidget } from './PomodoroWidget'
import { StopwatchWidget } from './StopwatchWidget'
import { TimerWidget } from './TimerWidget'

// Which skin a Timer wears is chosen from the card's title roller
// (WidgetSkinRoller), not here — this renderer only shows the worn one.
export function TimekeeperWidget({ data, onChange }: { data: TimekeeperData; onChange: (data: TimekeeperData) => void }) {
  return <div className="h-full">
    {data.mode==='countdown'&&<TimerWidget data={data.countdown} onChange={countdown=>onChange({...data,countdown})}/>}
    {data.mode==='pomodoro'&&<PomodoroWidget data={data.pomodoro} onChange={pomodoro=>onChange({...data,pomodoro})}/>}
    {data.mode==='stopwatch'&&<StopwatchWidget data={data.stopwatch} onChange={stopwatch=>onChange({...data,stopwatch})}/>}
  </div>
}
