import type {
  AssignmentData,
  CountdownData,
  ExcalidrawData,
  GpaData,
  KanbanData,
  LineChartData,
  ModuleData,
  ModuleType,
  OkrData,
  PieChartData,
  PriorityMatrixData,
  ProgressData,
  QuoteData,
  RandomPickerData,
  StickyNoteData,
  StudyGoalData,
  TimelineData,
  VocabData,
  QuizData,
  WeeklyPlannerData,
  DailyAgendaData,
} from '../types/spatial'
import { CONSOLIDATED_WIDGET_MODES, publicWidgetTypeFor, widgetDefinition } from '../widgets/registry'

/** Convert data arriving through AI/scenario creation from a former standalone
 * type into the canonical mode shape. Persisted old-board widgets deliberately
 * bypass this helper and keep their original type/data unchanged. */
export function consolidateWidgetData(type:ModuleType,data:ModuleData):{type:ModuleType;data:ModuleData} {
  const publicType=publicWidgetTypeFor(type)
  const mode=CONSOLIDATED_WIDGET_MODES[type]
  if(publicType===type||!mode)return{type,data}
  const defaults=widgetDefinition(publicType).defaultData() as unknown as Record<string,unknown>
  let patch:Record<string,unknown>={mode}

  switch(type){
    case 'sticky_note': { const value=data as StickyNoteData; patch={mode,text:value.text,color:value.color}; break }
    case 'quote': { const value=data as QuoteData; patch={mode,text:value.text,attribution:value.attribution}; break }
    case 'line_chart': { const value=data as LineChartData; patch={mode,title:value.title,unit:value.unit,bars:value.points}; break }
    case 'pie_chart': { const value=data as PieChartData; patch={mode:value.mode,title:value.title,bars:value.segments}; break }
    case 'random_picker': { const value=data as RandomPickerData; patch={mode,question:value.label,options:value.options.map(item=>item.text),weights:value.options.map(item=>item.weight),pickedIndex:value.pick?value.options.findIndex(item=>item.text===value.pick):null,history:value.history,lastRolledAt:value.lastRolledAt,noRepeatWindow:value.noRepeatWindow}; break }
    case 'gpa': patch={mode,gpa:data as GpaData}; break
    case 'countdown': { const value=data as CountdownData; patch={mode,label:value.label,date:value.targetDate}; break }
    case 'excalidraw': patch={mode,diagram:data as ExcalidrawData}; break
    case 'progress': patch={mode,simple:data as ProgressData}; break
    case 'study_goal': patch={mode,hours:data as StudyGoalData}; break
    case 'okr': patch={mode,okr:data as OkrData}; break
    case 'vocab': patch={mode,vocabulary:data as VocabData}; break
    case 'quiz': patch={mode,quiz:data as QuizData}; break
    case 'kanban': {
      const value=data as KanbanData
      patch={mode,items:value.columns.flatMap((column,index)=>column.cards.map(card=>({id:card.id,label:card.label,done:index===value.columns.length-1,status:index===0?'todo':index===value.columns.length-1?'done':'doing'})))}
      break
    }
    case 'assignment': { const value=data as AssignmentData; patch={mode,items:value.items.map(item=>({id:item.id,label:item.title??'',done:item.status==='done',status:item.status,due:item.due}))}; break }
    case 'daily_agenda': { const value=data as DailyAgendaData; patch={mode,items:value.items.map(item=>({id:item.id,label:item.title,done:item.done,due:value.date,time:item.time}))}; break }
    case 'weekly_planner': { const value=data as WeeklyPlannerData; patch={mode,items:value.days.flatMap((items,day)=>items.map(item=>({id:item.id,label:item.text,done:item.done,day})))}; break }
    case 'timeline': { const value=data as TimelineData; patch={mode,items:value.phases.map(phase=>({id:phase.id,label:phase.label,done:false,start:phase.start,span:phase.span}))}; break }
    case 'priority_matrix': { const value=data as PriorityMatrixData; patch={mode,items:value.items.map(item=>({id:item.id,label:item.text,done:false,quadrant:item.quadrant}))}; break }
  }
  return{type:publicType,data:{...defaults,...patch} as unknown as ModuleData}
}
