import type { ModuleData, ModuleType, Widget } from '../types/spatial'
import { WIDGET_REGISTRY, widgetDefinition } from '../widgets/registry'
import type { ThoughtPlan, ProposedNode } from './thoughtInterpreter'
import { detectDate } from './thoughtInterpreter'
import { EXTENDED_ARCHETYPES } from './scenarios/catalogue'
import { buildVocabulary, canonicalToken, normalizeLanguage, tokenCoverage, type NormalizedLanguage } from './languageNormalization'

/**
 * Scenario resolution — the layer above widget prediction.
 *
 * A thought like "I'm learning Spanish" is confidently *understood* but
 * deeply *underspecified*: topic is clear, immediate goal is not. Classic
 * widget classification would pretend one widget is objectively correct.
 * Instead, this module recognises the broader life scenario, proposes a
 * recommended workspace plus focused alternative directions, and surfaces
 * one compact question whose answer visibly reshapes the plan.
 *
 * Everything here is deterministic, local, and cheap — no network, no
 * layout reads, safe to run on every keystroke.
 */

// ---------------------------------------------------------------------------
// Specificity — measured separately from confidence
// ---------------------------------------------------------------------------

/** How pinned-down each slot of the thought is (0..1 each). A sentence can
 *  be confidently understood and still score near zero on most of these. */
export interface SpecificityProfile {
  topic: number
  immediateGoal: number
  desiredOutput: number
  timeframe: number
  constraints: number
  referencedEntities: number
}

const ACTION_START = /^\s*(add|ask|book|build|buy|call|cancel|check|create|email|finish|fix|make|new|plan|prepare|remember|review|schedule|send|ship|submit|test|track|turn|update|use|write)\b/i
const OUTPUT_WORDS = /\b(widget|list|table|tracker|board|kanban|chart|graph|planner|calendar|checklist|timeline|dashboard|flashcards?|notes?|form|matrix|timer|counter|budget)\b/i
const TIME_WORDS = /\b(today|tomorrow|tonight|by|until|deadline|due|next week|this week|next month|in \d+ (?:days?|weeks?|months?)|20\d{2})\b/i

function analyzeSpecificity(source: string): SpecificityProfile {
  const words = source.trim().split(/\s+/).length
  const mentions = (source.match(/@[\w.-]+/g) ?? []).length
  const urls = (source.match(/https?:\/\//g) ?? []).length
  const amounts = (source.match(/[$€£¥]\s?\d|\b\d+[\d,.]*\s?(?:usd|eur|gbp|dollars?|euros?|pounds?|kg|km|miles?|hours?|%)/gi) ?? []).length
  const multiline = /\n/.test(source.trim())
  return {
    topic: words >= 2 ? 0.8 : 0.4,
    immediateGoal: (ACTION_START.test(source) ? 0.7 : 0) + (multiline ? 0.3 : 0),
    desiredOutput: OUTPUT_WORDS.test(source) ? 0.8 : 0,
    timeframe: TIME_WORDS.test(source) ? 0.8 : 0,
    constraints: Math.min(1, amounts * 0.5),
    referencedEntities: Math.min(1, (mentions + urls) * 0.5),
  }
}

// ---------------------------------------------------------------------------
// Archetype catalogue
// ---------------------------------------------------------------------------

export interface DirectionSpec {
  id: string
  label: string
  tagline: string
  /** `{topic}` in a title is replaced with the extracted topic. */
  widgets: ReadonlyArray<{ type: ModuleType; title: string }>
}

export interface QuestionSpec {
  prompt: string
  options: ReadonlyArray<{ label: string; directionId: string }>
}

export type ScenarioDomain = 'learning' | 'career' | 'money' | 'home' | 'health' | 'people' | 'travel' | 'creative' | 'food' | 'admin' | 'business' | 'community'

export interface ArchetypeSpec {
  id: string
  label: string
  /** First capture group, when present, becomes the topic. */
  patterns: readonly RegExp[]
  topicFallback: string
  directions: readonly DirectionSpec[]
  question: QuestionSpec
  domain?: ScenarioDomain
  tone?: 'standard' | 'gentle'
  priority?: number
  keywords?: readonly string[]
  slots?: { deadline?: ModuleType; amount?: ModuleType; people?: ModuleType; links?: ModuleType }
}

const LANGUAGES = 'spanish|french|german|italian|portuguese|japanese|chinese|mandarin|korean|arabic|russian|hindi|dutch|swedish|polish|turkish|greek|hebrew|latin|english'

/**
 * Broad life-scenario coverage. Each archetype knows which Grovepad
 * combinations are normally useful, without expecting the user to know any
 * widget names. The first direction is the recommended complete workspace;
 * the rest are focused alternatives the micro-question maps onto.
 */
const BASE_ARCHETYPES: readonly ArchetypeSpec[] = [
  {
    id: 'language-learning',
    label: 'Language learning',
    patterns: [
      new RegExp(`\\b(?:learn(?:ing)?|study(?:ing)?|practi[cs]ing|improv(?:e|ing)(?: my)?|pick(?:ing)? up)\\s+(?:my\\s+|some\\s+)?(${LANGUAGES})\\b`, 'i'),
      new RegExp(`\\bmy\\s+(${LANGUAGES})\\s+(?:is|needs|journey|studies)\\b`, 'i'),
    ],
    topicFallback: 'Language',
    directions: [
      { id: 'hub', label: '{topic} learning hub', tagline: 'Goal, vocabulary, practice and streak in one place', widgets: [
        { type: 'study_goal', title: '{topic} goal' },
        { type: 'vocab', title: '{topic} vocabulary' },
        { type: 'flashcards', title: '{topic} flashcards' },
        { type: 'habit', title: 'Daily {topic} practice' },
      ] },
      { id: 'vocabulary', label: 'Build vocabulary', tagline: 'Collect words and drill them', widgets: [
        { type: 'vocab', title: '{topic} vocabulary' },
        { type: 'flashcards', title: '{topic} flashcards' },
      ] },
      { id: 'routine', label: 'Create a routine', tagline: 'A weekly rhythm with focused sessions', widgets: [
        { type: 'weekly_planner', title: '{topic} study week' },
        { type: 'pomodoro', title: 'Study sessions' },
        { type: 'habit', title: 'Daily {topic} practice' },
      ] },
      { id: 'progress', label: 'Track progress', tagline: 'See how far you have come', widgets: [
        { type: 'study_goal', title: '{topic} goal' },
        { type: 'progress', title: '{topic} progress' },
      ] },
      { id: 'resources', label: 'Collect material', tagline: 'Readings, courses and links in one spot', widgets: [
        { type: 'reading_list', title: '{topic} reading' },
        { type: 'links', title: '{topic} resources' },
      ] },
    ],
    question: { prompt: 'What are you focusing on right now?', options: [
      { label: 'Vocabulary', directionId: 'vocabulary' },
      { label: 'Speaking', directionId: 'routine' },
      { label: 'Grammar', directionId: 'vocabulary' },
      { label: 'Consistency', directionId: 'routine' },
    ] },
  },
  {
    id: 'exam-prep',
    label: 'Exam preparation',
    patterns: [
      /\b(?:prep(?:ping|are|aring)?(?: for)?|study(?:ing)? for|revis(?:e|ing) for|getting ready for)\s+(?:my |the |an? )?([\w][\w\s-]{1,28}?)?\s*(?:exam|test|midterm|finals?|certification)\b/i,
      /\b(dele|ielts|toefl|sat|gre|gmat|mcat|lsat|bar exam)\b/i,
    ],
    topicFallback: 'Exam',
    directions: [
      { id: 'hub', label: '{topic} prep base', tagline: 'Goal, schedule, countdown and drills together', widgets: [
        { type: 'study_goal', title: '{topic} target' },
        { type: 'weekly_planner', title: 'Revision week' },
        { type: 'countdown', title: '{topic} day' },
        { type: 'flashcards', title: '{topic} drills' },
      ] },
      { id: 'schedule', label: 'Build a study schedule', tagline: 'Plan the weeks that remain', widgets: [
        { type: 'weekly_planner', title: 'Revision week' },
        { type: 'countdown', title: '{topic} day' },
      ] },
      { id: 'practice', label: 'Practice questions', tagline: 'Drill until it sticks', widgets: [
        { type: 'quiz', title: '{topic} practice' },
        { type: 'flashcards', title: '{topic} drills' },
      ] },
      { id: 'coverage', label: 'Cover the syllabus', tagline: 'Track every topic to done', widgets: [
        { type: 'checklist', title: '{topic} topics' },
        { type: 'progress', title: 'Syllabus coverage' },
      ] },
    ],
    question: { prompt: 'What would help most first?', options: [
      { label: 'A schedule', directionId: 'schedule' },
      { label: 'Practice', directionId: 'practice' },
      { label: 'Topic list', directionId: 'coverage' },
    ] },
  },
  {
    id: 'learn-skill',
    label: 'Learning a skill',
    patterns: [
      /\b(?:learn(?:ing)?|teach(?:ing)? myself|get(?:ting)? (?:better at|into)|pick(?:ing)? up)\s+(?:how to\s+)?((?:play(?:ing)? (?:the )?)?[a-z][\w-]*(?:\s[\w-]+)?)\b/i,
    ],
    topicFallback: 'New skill',
    directions: [
      { id: 'hub', label: '{topic} practice hub', tagline: 'Goal, streak and material together', widgets: [
        { type: 'goal_tracker', title: '{topic} goal' },
        { type: 'habit', title: '{topic} practice streak' },
        { type: 'reading_list', title: '{topic} material' },
      ] },
      { id: 'routine', label: 'Practice routine', tagline: 'Regular focused sessions', widgets: [
        { type: 'habit', title: '{topic} practice streak' },
        { type: 'pomodoro', title: 'Practice sessions' },
        { type: 'weekly_planner', title: '{topic} week' },
      ] },
      { id: 'progress', label: 'Track improvement', tagline: 'Milestones and a practice log', widgets: [
        { type: 'goal_tracker', title: '{topic} goal' },
        { type: 'logbook', title: 'Practice log' },
      ] },
      { id: 'resources', label: 'Collect material', tagline: 'Tutorials, courses and references', widgets: [
        { type: 'reading_list', title: '{topic} material' },
        { type: 'links', title: '{topic} links' },
      ] },
    ],
    question: { prompt: 'What do you want help with first?', options: [
      { label: 'A routine', directionId: 'routine' },
      { label: 'Seeing progress', directionId: 'progress' },
      { label: 'Good material', directionId: 'resources' },
    ] },
  },
  {
    id: 'start-project',
    label: 'Starting a project',
    patterns: [
      /\b(?:start(?:ing)?|kick(?:ing)? off)\s+(?:a |the |my )?(?:new )?([\w][\w\s-]{1,26}?)?\s*project\b/i,
      /\bbuild(?:ing)?\s+(?:a |an |my )?(app|website|game|product|mvp|portfolio|prototype)\b/i,
      /\bside project\b/i,
    ],
    topicFallback: 'Project',
    directions: [
      { id: 'hub', label: '{topic} workspace', tagline: 'Board, plan and notes for the whole effort', widgets: [
        { type: 'kanban', title: '{topic} board' },
        { type: 'timeline', title: '{topic} plan' },
        { type: 'notes', title: '{topic} notes' },
      ] },
      { id: 'plan', label: 'Plan it out', tagline: 'Phases, tasks and what could go wrong', widgets: [
        { type: 'timeline', title: '{topic} plan' },
        { type: 'checklist', title: 'First steps' },
        { type: 'risk_register', title: '{topic} risks' },
      ] },
      { id: 'track', label: 'Track the work', tagline: 'A board plus a progress pulse', widgets: [
        { type: 'kanban', title: '{topic} board' },
        { type: 'progress', title: '{topic} progress' },
      ] },
      { id: 'shape', label: 'Shape the idea', tagline: 'Capture and prioritise before committing', widgets: [
        { type: 'notes', title: '{topic} idea' },
        { type: 'priority_matrix', title: 'What matters first' },
      ] },
    ],
    question: { prompt: 'Where are you with it?', options: [
      { label: 'Still an idea', directionId: 'shape' },
      { label: 'Ready to plan', directionId: 'plan' },
      { label: 'Already working', directionId: 'track' },
    ] },
  },
  {
    id: 'plan-trip',
    label: 'Trip planning',
    patterns: [
      /\b(?:trip|travel(?:l?ing)?|vacation|holiday|going)\s+to\s+([A-Za-z][\w'’\s-]{1,24})/i,
      /\bplan(?:ning)?\s+(?:a |the |our |my )?(?:trip|vacation|holiday|getaway|road trip)\b/i,
      /\bvisit(?:ing)?\s+([A-Z][\w'’\s-]{1,24})\b/,
    ],
    topicFallback: 'Trip',
    directions: [
      { id: 'hub', label: '{topic} trip base', tagline: 'Itinerary, expenses, packing and departure together', widgets: [
        { type: 'trip_itinerary', title: '{topic} itinerary' },
        { type: 'expense_split', title: '{topic} shared costs' },
        { type: 'checklist', title: '{topic}: to sort out' },
        { type: 'countdown', title: 'Departure' },
      ] },
      { id: 'itinerary', label: 'Sketch the itinerary', tagline: 'Days, order and pace', widgets: [
        { type: 'trip_itinerary', title: '{topic} itinerary' },
        { type: 'timeline', title: '{topic} outline' },
      ] },
      { id: 'budget', label: 'Set the budget', tagline: 'Costs before commitments', widgets: [
        { type: 'expense_split', title: '{topic} shared costs' },
        { type: 'checklist', title: 'To book' },
      ] },
      { id: 'logistics', label: 'Packing & booking', tagline: 'Everything to pack and reserve', widgets: [
        { type: 'checklist', title: 'Packing list' },
        { type: 'countdown', title: 'Departure' },
        { type: 'links', title: 'Bookings' },
      ] },
    ],
    question: { prompt: 'What needs sorting first?', options: [
      { label: 'The plan', directionId: 'itinerary' },
      { label: 'The money', directionId: 'budget' },
      { label: 'The logistics', directionId: 'logistics' },
    ] },
  },
  {
    id: 'fitness',
    label: 'Fitness',
    patterns: [
      /\b(?:get(?:ting)? (?:fit|in shape|stronger)|work(?:ing)? out|going to the gym|start(?:ing)? (?:running|lifting|swimming|cycling)|train(?:ing)? for\s+(?:a |the )?([\w][\w\s-]{1,24})?|lose weight|losing weight|build(?:ing)? muscle)\b/i,
    ],
    topicFallback: 'Training',
    directions: [
      { id: 'hub', label: '{topic} hub', tagline: 'Streak, goal and numbers in one view', widgets: [
        { type: 'habit', title: '{topic} streak' },
        { type: 'goal_tracker', title: '{topic} goal' },
        { type: 'metrics', title: '{topic} numbers' },
      ] },
      { id: 'routine', label: 'Weekly routine', tagline: 'Which days, which workouts', widgets: [
        { type: 'weekly_planner', title: '{topic} week' },
        { type: 'habit', title: '{topic} streak' },
      ] },
      { id: 'progress', label: 'Track the numbers', tagline: 'Watch the trend, not the day', widgets: [
        { type: 'metrics', title: '{topic} numbers' },
        { type: 'line_chart', title: '{topic} trend' },
      ] },
      { id: 'plan', label: 'Training plan', tagline: 'A structured build-up', widgets: [
        { type: 'timeline', title: '{topic} plan' },
        { type: 'checklist', title: 'This week' },
      ] },
    ],
    question: { prompt: 'What would keep you going?', options: [
      { label: 'A routine', directionId: 'routine' },
      { label: 'Seeing progress', directionId: 'progress' },
      { label: 'A real plan', directionId: 'plan' },
    ] },
  },
  {
    id: 'habit-building',
    label: 'Building a habit',
    patterns: [
      /\b(?:build(?:ing)?|start(?:ing)?|develop(?:ing)?|form(?:ing)?)\s+(?:a |the |new )?habit(?:\s+of\s+([\w][\w\s-]{1,24}))?/i,
      /\b(?:meditat(?:e|ing)|journal(?:ing)?|drink(?:ing)? more water|sleep(?:ing)? (?:better|earlier|more)|wak(?:e|ing) up earlier|(quit(?:ting)?\s+(?:smoking|vaping|sugar|coffee|caffeine|alcohol|drinking|soda|junk food|doomscrolling))|keep forgetting to\s+([\w][\w\s-]{1,20}))\b/i,
    ],
    topicFallback: 'New habit',
    directions: [
      { id: 'hub', label: '{topic} tracker', tagline: 'Streak plus a mood pulse', widgets: [
        { type: 'habit', title: '{topic}' },
        { type: 'mood_tracker', title: 'How it feels' },
      ] },
      { id: 'single', label: 'Just the streak', tagline: 'One habit, one chain, keep it alive', widgets: [
        { type: 'habit', title: '{topic}' },
      ] },
      { id: 'routine', label: 'Anchor it to a routine', tagline: 'Give the habit a fixed home in the day', widgets: [
        { type: 'daily_agenda', title: 'Daily rhythm' },
        { type: 'habit', title: '{topic}' },
      ] },
      { id: 'reflect', label: 'Track & reflect', tagline: 'Notice what helps and what breaks it', widgets: [
        { type: 'habit', title: '{topic}' },
        { type: 'logbook', title: '{topic} notes' },
      ] },
    ],
    question: { prompt: 'How do you want to hold yourself to it?', options: [
      { label: 'Simple streak', directionId: 'single' },
      { label: 'Fixed time of day', directionId: 'routine' },
      { label: 'Reflection', directionId: 'reflect' },
    ] },
  },
  {
    id: 'personal-finance',
    label: 'Personal finance',
    patterns: [
      /\b(?:sav(?:e|ing)(?: up)?(?: money)?(?: for\s+(?:a |an |the )?([\w][\w\s-]{1,24}))?|budget(?:ing)?|track(?:ing)? (?:my )?(?:spending|expenses|money)|pay(?:ing)? off (?:debt|loans?|credit cards?)|get(?:ting)? (?:my )?finances)\b/i,
    ],
    topicFallback: 'Money',
    directions: [
      { id: 'hub', label: '{topic} overview', tagline: 'Budget, goal and key numbers', widgets: [
        { type: 'budget', title: 'Monthly budget' },
        { type: 'goal_tracker', title: '{topic} goal' },
        { type: 'metrics', title: 'Key numbers' },
      ] },
      { id: 'budget', label: 'Monthly budget', tagline: 'Where the money goes each month', widgets: [
        { type: 'budget', title: 'Monthly budget' },
        { type: 'pie_chart', title: 'Spending split' },
      ] },
      { id: 'goal', label: 'Savings goal', tagline: 'A number and a date to hit it', widgets: [
        { type: 'goal_tracker', title: '{topic} goal' },
        { type: 'progress', title: 'Saved so far' },
      ] },
      { id: 'log', label: 'Spending log', tagline: 'Write it down, watch the trend', widgets: [
        { type: 'logbook', title: 'Spending log' },
        { type: 'line_chart', title: 'Spend over time' },
      ] },
    ],
    question: { prompt: 'What matters most right now?', options: [
      { label: 'Monthly control', directionId: 'budget' },
      { label: 'A savings goal', directionId: 'goal' },
      { label: 'Knowing where it goes', directionId: 'log' },
    ] },
  },
  {
    id: 'plan-event',
    label: 'Event planning',
    patterns: [
      /\b(?:plan(?:ning)?|organi[sz](?:e|ing)|host(?:ing)?|throw(?:ing)?)\s+(?:a |an |the |my |our )?(?:[\w][\w\s-]{0,20}?\s+)?(party|wedding|birthday|event|reunion|dinner|shower|barbecue|bbq|meetup|conference)\b/i,
    ],
    topicFallback: 'Event',
    directions: [
      { id: 'hub', label: '{topic} planner', tagline: 'Tasks, budget, countdown and people', widgets: [
        { type: 'checklist', title: '{topic} to-dos' },
        { type: 'budget', title: '{topic} budget' },
        { type: 'countdown', title: 'The big day' },
        { type: 'contact', title: 'Key people' },
      ] },
      { id: 'guests', label: 'Guest list', tagline: 'Who is coming and who to chase', widgets: [
        { type: 'table', title: 'Guest list' },
        { type: 'poll', title: 'RSVP' },
      ] },
      { id: 'logistics', label: 'Logistics', tagline: 'Everything that must happen, in order', widgets: [
        { type: 'checklist', title: '{topic} to-dos' },
        { type: 'timeline', title: 'Run-up plan' },
      ] },
      { id: 'budget', label: 'Budget', tagline: 'Keep the costs honest', widgets: [
        { type: 'budget', title: '{topic} budget' },
      ] },
    ],
    question: { prompt: 'Whats the pressing part?', options: [
      { label: 'Guests', directionId: 'guests' },
      { label: 'Logistics', directionId: 'logistics' },
      { label: 'Costs', directionId: 'budget' },
    ] },
  },
  {
    id: 'job-search',
    label: 'Job search',
    patterns: [
      /\b(?:job (?:search|hunt(?:ing)?)|apply(?:ing)? (?:for|to) jobs?|find(?:ing)? a (?:new )?job|looking for (?:a )?(?:new )?(?:job|work|role)|interview prep|switch(?:ing)? (?:jobs?|careers?))\b/i,
    ],
    topicFallback: 'Job search',
    directions: [
      { id: 'hub', label: 'Job search HQ', tagline: 'Pipeline, contacts and next steps', widgets: [
        { type: 'job_applications', title: 'Applications' },
        { type: 'snippet_library', title: 'Replies & stories' },
        { type: 'calendar', title: 'Follow-up dates' },
      ] },
      { id: 'pipeline', label: 'Application pipeline', tagline: 'Every application, stage by stage', widgets: [
        { type: 'job_applications', title: 'Applications' },
        { type: 'snippet_library', title: 'Application snippets' },
      ] },
      { id: 'interview', label: 'Interview prep', tagline: 'Stories, answers and drills', widgets: [
        { type: 'flashcards', title: 'Interview answers' },
        { type: 'checklist', title: 'Prep list' },
        { type: 'notes', title: 'Stories that land' },
      ] },
      { id: 'network', label: 'Network', tagline: 'People who can open doors', widgets: [
        { type: 'contact', title: 'Contacts' },
        { type: 'links', title: 'Postings & profiles' },
      ] },
    ],
    question: { prompt: 'Which part is on your mind?', options: [
      { label: 'Applications', directionId: 'pipeline' },
      { label: 'Interviews', directionId: 'interview' },
      { label: 'Connections', directionId: 'network' },
    ] },
  },
  {
    id: 'moving-home',
    label: 'Moving home',
    patterns: [
      /\b(?:mov(?:e|ing)(?:\s+(?:house|home|out|cities|abroad|to\s+([A-Za-z][\w\s-]{1,20})))|relocat(?:e|ing)|found (?:a |an )?(?:new )?(?:apartment|flat|house|place))\b/i,
    ],
    topicFallback: 'The move',
    directions: [
      { id: 'hub', label: 'Moving mission control', tagline: 'Tasks, costs and the countdown', widgets: [
        { type: 'checklist', title: 'Moving tasks' },
        { type: 'budget', title: 'Moving costs' },
        { type: 'countdown', title: 'Moving day' },
      ] },
      { id: 'tasks', label: 'The task list', tagline: 'Everything, in the right order', widgets: [
        { type: 'checklist', title: 'Moving tasks' },
        { type: 'timeline', title: 'Weeks until the move' },
      ] },
      { id: 'costs', label: 'The costs', tagline: 'Deposits, movers, surprises', widgets: [
        { type: 'budget', title: 'Moving costs' },
      ] },
      { id: 'admin', label: 'Address admin', tagline: 'Everyone who needs the new address', widgets: [
        { type: 'checklist', title: 'Address changes' },
      ] },
    ],
    question: { prompt: 'What worries you most?', options: [
      { label: 'Forgetting things', directionId: 'tasks' },
      { label: 'The cost', directionId: 'costs' },
      { label: 'The paperwork', directionId: 'admin' },
    ] },
  },
  {
    id: 'reading',
    label: 'Reading',
    patterns: [
      /\b(?:read(?:ing)? more|reading (?:list|goal|habit)|books? (?:i want to read|to read|to finish)|book club|get through (?:these |some )?books?)\b/i,
    ],
    topicFallback: 'Reading',
    directions: [
      { id: 'hub', label: 'Reading corner', tagline: 'Queue, streak and a goal', widgets: [
        { type: 'reading_list', title: 'Reading queue' },
        { type: 'habit', title: 'Daily reading' },
        { type: 'goal_tracker', title: 'Books this year' },
      ] },
      { id: 'list', label: 'The queue', tagline: 'What to read next', widgets: [
        { type: 'reading_list', title: 'Reading queue' },
      ] },
      { id: 'habit', label: 'A reading habit', tagline: 'Pages every day', widgets: [
        { type: 'habit', title: 'Daily reading' },
        { type: 'counter', title: 'Books finished' },
      ] },
      { id: 'notes', label: 'Capture what sticks', tagline: 'Notes and lines worth keeping', widgets: [
        { type: 'notes', title: 'Reading notes' },
        { type: 'quote', title: 'Lines worth keeping' },
      ] },
    ],
    question: { prompt: 'What do you want from it?', options: [
      { label: 'Read more often', directionId: 'habit' },
      { label: 'An organised queue', directionId: 'list' },
      { label: 'Remember more', directionId: 'notes' },
    ] },
  },
  {
    id: 'research',
    label: 'Research',
    patterns: [
      /\bresearch(?:ing)?\s+(?:on |into |about )?([\w][\w\s-]{2,28})/i,
      /\b(?:literature review|deep dive(?:\s+(?:on|into)\s+([\w][\w\s-]{2,24}))?|organi[sz]e my research)\b/i,
    ],
    topicFallback: 'Research',
    directions: [
      { id: 'hub', label: '{topic} research desk', tagline: 'Structure, sources and open questions', widgets: [
        { type: 'outline', title: '{topic} structure' },
        { type: 'citation', title: '{topic} sources' },
        { type: 'reading_list', title: 'To read' },
        { type: 'notes', title: 'Working notes' },
      ] },
      { id: 'sources', label: 'Gather sources', tagline: 'Collect and cite as you go', widgets: [
        { type: 'citation', title: '{topic} sources' },
        { type: 'links', title: 'Found online' },
        { type: 'reading_list', title: 'To read' },
      ] },
      { id: 'synthesis', label: 'Synthesise', tagline: 'Turn reading into structure', widgets: [
        { type: 'outline', title: '{topic} structure' },
        { type: 'notes', title: 'Working notes' },
      ] },
      { id: 'questions', label: 'Open questions', tagline: 'What still needs answering', widgets: [
        { type: 'checklist', title: 'Open questions' },
        { type: 'notes', title: 'Hypotheses' },
      ] },
    ],
    question: { prompt: 'Where are you in it?', options: [
      { label: 'Collecting', directionId: 'sources' },
      { label: 'Making sense of it', directionId: 'synthesis' },
      { label: 'Framing questions', directionId: 'questions' },
    ] },
  },
  {
    id: 'decision',
    label: 'Making a decision',
    patterns: [
      /\b(?:should i|can'?t decide|torn between|decid(?:e|ing) (?:between|whether|if)|weigh(?:ing)? (?:my |the )?options|big decision)\b/i,
    ],
    topicFallback: 'The decision',
    directions: [
      { id: 'hub', label: 'Decision workspace', tagline: 'Trade-offs plus a weighted comparison', widgets: [
        { type: 'pros_cons', title: 'Trade-offs' },
        { type: 'decision_matrix', title: 'Weighted comparison' },
      ] },
      { id: 'quick', label: 'Quick pros & cons', tagline: 'Both sides on one card', widgets: [
        { type: 'pros_cons', title: 'Trade-offs' },
      ] },
      { id: 'weighted', label: 'Weighted comparison', tagline: 'Score options against what matters', widgets: [
        { type: 'decision_matrix', title: 'Weighted comparison' },
      ] },
      { id: 'gut', label: 'Gut check', tagline: 'Sometimes you just need to pick', widgets: [
        { type: 'decision', title: 'The pick' },
      ] },
    ],
    question: { prompt: 'How rigorous do you want to be?', options: [
      { label: 'Quick take', directionId: 'quick' },
      { label: 'Proper analysis', directionId: 'weighted' },
      { label: 'Just help me pick', directionId: 'gut' },
    ] },
  },
  {
    id: 'meal-planning',
    label: 'Food & cooking',
    patterns: [
      /\b(?:meal (?:prep(?:ping)?|plan(?:ning)?)|cook(?:ing)? more|eat(?:ing)? (?:healthier|better|at home)|recipes? (?:to try|i want)|weekly menu)\b/i,
    ],
    topicFallback: 'Meals',
    directions: [
      { id: 'hub', label: 'Kitchen HQ', tagline: 'Menu, groceries and recipes together', widgets: [
        { type: 'weekly_planner', title: 'Weekly menu' },
        { type: 'checklist', title: 'Groceries' },
        { type: 'links', title: 'Recipes to try' },
      ] },
      { id: 'menu', label: 'Weekly menu', tagline: 'Decide once, eat all week', widgets: [
        { type: 'weekly_planner', title: 'Weekly menu' },
      ] },
      { id: 'groceries', label: 'Groceries & cost', tagline: 'Shop once, spend less', widgets: [
        { type: 'checklist', title: 'Groceries' },
        { type: 'budget', title: 'Food spend' },
      ] },
      { id: 'recipes', label: 'Recipe box', tagline: 'Keep the keepers', widgets: [
        { type: 'links', title: 'Recipes to try' },
        { type: 'notes', title: 'Tweaks that worked' },
      ] },
    ],
    question: { prompt: 'Whats the goal?', options: [
      { label: 'Less deciding', directionId: 'menu' },
      { label: 'Cheaper shopping', directionId: 'groceries' },
      { label: 'Better cooking', directionId: 'recipes' },
    ] },
  },
  {
    id: 'big-purchase',
    label: 'Big purchase',
    patterns: [
      /\b(?:buy(?:ing)?|shopping for|choos(?:e|ing)|pick(?:ing)?)\s+(?:a |an |the |my (?:first |next )?)?(car|house|home|laptop|phone|camera|bike|motorbike|apartment|tv|couch|mattress|guitar|piano|drone)\b/i,
    ],
    topicFallback: 'Purchase',
    directions: [
      { id: 'hub', label: '{topic} decision base', tagline: 'Compare, budget and shortlist', widgets: [
        { type: 'decision_matrix', title: '{topic} comparison' },
        { type: 'budget', title: '{topic} budget' },
        { type: 'links', title: 'Candidates' },
      ] },
      { id: 'compare', label: 'Compare options', tagline: 'Score them on what matters', widgets: [
        { type: 'decision_matrix', title: '{topic} comparison' },
        { type: 'pros_cons', title: 'Front-runner trade-offs' },
      ] },
      { id: 'afford', label: 'Afford it', tagline: 'A number and a plan to reach it', widgets: [
        { type: 'budget', title: '{topic} budget' },
        { type: 'goal_tracker', title: 'Saving for it' },
      ] },
      { id: 'shortlist', label: 'Build a shortlist', tagline: 'Collect candidates before judging', widgets: [
        { type: 'table', title: '{topic} shortlist' },
        { type: 'links', title: 'Listings' },
      ] },
    ],
    question: { prompt: 'Where are you in the hunt?', options: [
      { label: 'Still browsing', directionId: 'shortlist' },
      { label: 'Comparing finalists', directionId: 'compare' },
      { label: 'Saving up', directionId: 'afford' },
    ] },
  },
  {
    id: 'home-improvement',
    label: 'Home improvement',
    patterns: [
      /\b(?:renovat(?:e|ing)|remodel(?:ing)?|redecorat(?:e|ing)|redo(?:ing)?|fix(?:ing)? up)\s+(?:the |my |our )?([\w][\w\s-]{1,20})?/i,
      /\bdiy project\b/i,
    ],
    topicFallback: 'The house',
    directions: [
      { id: 'hub', label: '{topic} project base', tagline: 'Tasks, costs, timing and sketches', widgets: [
        { type: 'checklist', title: '{topic} tasks' },
        { type: 'budget', title: '{topic} costs' },
        { type: 'timeline', title: '{topic} phases' },
      ] },
      { id: 'plan', label: 'Plan the work', tagline: 'Order matters when walls come down', widgets: [
        { type: 'timeline', title: '{topic} phases' },
        { type: 'checklist', title: '{topic} tasks' },
      ] },
      { id: 'costs', label: 'Cost it out', tagline: 'Materials, trades and buffer', widgets: [
        { type: 'budget', title: '{topic} costs' },
        { type: 'inventory', title: 'Materials' },
      ] },
      { id: 'design', label: 'Collect ideas', tagline: 'Sketches and inspiration first', widgets: [
        { type: 'sketchpad', title: '{topic} sketches' },
        { type: 'links', title: 'Inspiration' },
      ] },
    ],
    question: { prompt: 'What stage is it at?', options: [
      { label: 'Dreaming', directionId: 'design' },
      { label: 'Planning', directionId: 'plan' },
      { label: 'Pricing', directionId: 'costs' },
    ] },
  },
  {
    id: 'writing-project',
    label: 'Writing',
    patterns: [
      /\b(?:writ(?:e|ing)|draft(?:ing)?|work(?:ing)? on)\s+(?:a |an |my |the )?(book|novel|blog|thesis|dissertation|essay|article|screenplay|memoir|newsletter)\b/i,
      /\bnanowrimo\b/i,
    ],
    topicFallback: 'Writing',
    directions: [
      { id: 'hub', label: '{topic} writing desk', tagline: 'Structure, word-count goal and momentum', widgets: [
        { type: 'outline', title: '{topic} outline' },
        { type: 'goal_tracker', title: '{topic} milestones' },
        { type: 'habit', title: 'Daily writing' },
      ] },
      { id: 'structure', label: 'Structure it', tagline: 'Shape before sentences', widgets: [
        { type: 'outline', title: '{topic} outline' },
        { type: 'notes', title: '{topic} ideas' },
      ] },
      { id: 'momentum', label: 'Build momentum', tagline: 'Words every day, counted', widgets: [
        { type: 'habit', title: 'Daily writing' },
        { type: 'counter', title: 'Words written' },
        { type: 'goal_tracker', title: '{topic} milestones' },
      ] },
      { id: 'research', label: 'Research it', tagline: 'Sources and reading first', widgets: [
        { type: 'citation', title: '{topic} sources' },
        { type: 'reading_list', title: 'To read' },
      ] },
    ],
    question: { prompt: 'What do you fight with most?', options: [
      { label: 'Structure', directionId: 'structure' },
      { label: 'Consistency', directionId: 'momentum' },
      { label: 'Knowing enough', directionId: 'research' },
    ] },
  },
  {
    id: 'startup',
    label: 'Business idea',
    patterns: [
      /\b(?:start(?:ing)?\s+(?:a |my )?(?:[\w][\w\s-]{0,20}?\s+)?(?:business|company|startup)|launch(?:ing)? (?:a |my )?(?:product|store|shop|brand)|business idea|going freelance|open(?:ing)? a (?:shop|store|cafe|restaurant))\b/i,
    ],
    topicFallback: 'The business',
    directions: [
      { id: 'hub', label: '{topic} launchpad', tagline: 'Position, plan, money and work', widgets: [
        { type: 'swot', title: '{topic} position' },
        { type: 'timeline', title: 'Road to launch' },
        { type: 'budget', title: 'Runway' },
        { type: 'kanban', title: 'The work' },
      ] },
      { id: 'validate', label: 'Validate the idea', tagline: 'Is it worth building?', widgets: [
        { type: 'swot', title: '{topic} position' },
        { type: 'pros_cons', title: 'Go / no-go' },
      ] },
      { id: 'plan', label: 'Plan the launch', tagline: 'Milestones and what could sink it', widgets: [
        { type: 'timeline', title: 'Road to launch' },
        { type: 'risk_register', title: 'What could go wrong' },
      ] },
      { id: 'numbers', label: 'Run the numbers', tagline: 'Costs, runway, break-even', widgets: [
        { type: 'budget', title: 'Runway' },
        { type: 'metrics', title: 'Business numbers' },
      ] },
    ],
    question: { prompt: 'What keeps you up at night?', options: [
      { label: 'Is it viable?', directionId: 'validate' },
      { label: 'Getting to launch', directionId: 'plan' },
      { label: 'The money', directionId: 'numbers' },
    ] },
  },
  {
    id: 'wellbeing',
    label: 'Wellbeing',
    patterns: [
      /\b(?:self[- ]care|reduce stress|less stressed|feel(?:ing)? (?:overwhelmed|burn(?:ed|t) out)|mental health|mindfulness|work[- ]life balance|slow(?:ing)? down)\b/i,
    ],
    topicFallback: 'Wellbeing',
    directions: [
      { id: 'hub', label: 'Wellbeing check-in', tagline: 'A gentle daily pulse', widgets: [
        { type: 'mood_tracker', title: 'Daily check-in' },
        { type: 'habit', title: 'One kind thing a day' },
      ] },
      { id: 'mood', label: 'Track how you feel', tagline: 'Patterns become visible over weeks', widgets: [
        { type: 'mood_tracker', title: 'Daily check-in' },
        { type: 'logbook', title: 'What affected it' },
      ] },
      { id: 'routine', label: 'Protect a routine', tagline: 'Small anchors through the day', widgets: [
        { type: 'daily_agenda', title: 'A gentler day' },
        { type: 'habit', title: 'Daily anchor' },
      ] },
      { id: 'unload', label: 'Get it out of your head', tagline: 'A private place to write', widgets: [
        { type: 'notes', title: 'Brain dump' },
      ] },
    ],
    question: { prompt: 'What would help today?', options: [
      { label: 'Noticing patterns', directionId: 'mood' },
      { label: 'More structure', directionId: 'routine' },
      { label: 'Writing it out', directionId: 'unload' },
    ] },
  },
]

export const ARCHETYPES: readonly ArchetypeSpec[] = [...BASE_ARCHETYPES, ...EXTENDED_ARCHETYPES]

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface ResolvedDirection {
  id: string
  label: string
  tagline: string
  plan: ThoughtPlan
  /** Set when canvas context influenced this direction's rank. */
  note?: string
}

export interface ScenarioResolution {
  archetypeId: string
  archetypeLabel: string
  topic: string
  specificity: SpecificityProfile
  directions: ResolvedDirection[]
  recommendedId: string
  question: QuestionSpec
  /** Short, human explanations of how context changed the ranking. */
  contextNotes: string[]
  /** Matching evidence exposed to the UI instead of pretending an uncertain
   * interpretation is certain. */
  matchConfidence: number
  matchMargin: number
  ambiguous: boolean
  alternatives: ReadonlyArray<{ archetypeId: string; label: string; score: number }>
}

export interface ScenarioContext {
  canvasName?: string
  selectedWidgetTitle?: string
  /** Widgets on the active canvas, for duplicate-aware reranking. */
  canvasWidgets?: readonly Widget[]
  /** Lets the user choose one of the locally-ranked interpretations. */
  forceArchetypeId?: string
  /** Original text used when a local router selected an archetype by id. */
  sourceText?: string
  /** Validated router confidence, used only for transparent UI ranking. */
  routeConfidence?: number
}

const STOP_TOPICS = /^(?:the|a|an|my|our|more|some|how|it|this|that|better)$/i
/** Connectives that end a topic phrase: "trip to Tokyo in spring" → "Tokyo". */
const TOPIC_TRAIL = /\s+(?:in|on|at|for|with|during|this|next|by|before|after|over|around)\b[\s\S]*$/i

function titleCase(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/^\p{L}/u, (ch) => ch.toUpperCase())
}

function extractTopic(spec: ArchetypeSpec, source: string): string {
  for (const pattern of spec.patterns) {
    const match = source.match(pattern)
    if (!match) continue
    const captured = match.slice(1)
      .map((group) => group?.replace(TOPIC_TRAIL, '').trim())
      .find((group) => group && !STOP_TOPICS.test(group))
    if (captured) return titleCase(captured).slice(0, 28)
  }
  return spec.topicFallback
}

function hydratedData(type: ModuleType, source: string, title: string): ModuleData {
  const defaults = widgetDefinition(type).defaultData() as unknown as Record<string, unknown>
  const date = detectDate(source)
  const money = source.match(/(?:[$€£¥]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|gbp|dollars?|euros?|pounds?))/i)?.[0]
  const amount = money ? Number(money.replace(/[^\d.-]/g, '')) : null
  const email = source.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]
  const mention = source.match(/@([\w.-]+)/)?.[1]
  const urls = source.match(/https?:\/\/[^\s)]+/g) ?? []

  if (type === 'countdown' && date) return { ...defaults, label: title, targetDate: date } as ModuleData
  if (type === 'date_picker' && date) return { ...defaults, label: title, date } as ModuleData
  if (type === 'budget' && amount !== null) {
    const currency = money?.includes('€') ? 'EUR' : money?.includes('£') ? 'GBP' : 'USD'
    return { ...defaults, currency, items: [{ id: crypto.randomUUID(), label: title, amount }] } as ModuleData
  }
  if (type === 'goal_tracker' && amount !== null) return { ...defaults, goal: `${title} — target ${money}` } as unknown as ModuleData
  if (type === 'contact' && (mention || email)) return { ...defaults, name: titleCase(mention ?? ''), email: email ?? '' } as ModuleData
  if (type === 'links' && urls.length) return { ...defaults, items: urls.map((url) => ({ id: crypto.randomUUID(), label: new URL(url).hostname, url })) } as ModuleData
  return defaults as unknown as ModuleData
}

function buildPlan(source: string, topic: string, direction: DirectionSpec, confidence: number): ThoughtPlan {
  const nodes: ProposedNode[] = direction.widgets.map((widget, index) => ({
    temporaryId: `scenario-${index + 1}`,
    widgetType: widget.type,
    title: widget.title.replaceAll('{topic}', topic).slice(0, 80),
    data: hydratedData(widget.type, source, widget.title.replaceAll('{topic}', topic)),
    sourceText: source,
    confidence,
    depth: index === 0 ? 0 : 1,
    metadata: { badges: [], sourceText: source, interpretationConfidence: confidence },
  }))
  return {
    sourceText: source,
    confidence,
    nodes,
    // The lead widget anchors the cluster; the rest hang off it so the
    // canvas immediately reads as one workspace, not scattered cards.
    relations: nodes.slice(1).map((node) => ({
      fromTemporaryId: nodes[0]!.temporaryId,
      toTemporaryId: node.temporaryId,
      type: 'parent' as const,
    })),
    groups: [],
    warnings: [],
  }
}

function reuseExistingNodes(plan: ThoughtPlan, widgets: readonly Widget[]): ThoughtPlan {
  if (!widgets.length) return plan
  const used = new Set<string>()
  const nodes = plan.nodes.map((node) => {
    const titleTokens = sourceTokens(node.title)
    const existing = widgets.find((widget) => {
      if (used.has(widget.id) || widget.type !== node.widgetType) return false
      const existingTokens = sourceTokens(widget.title)
      return [...titleTokens].some((token) => token.length >= 4 && existingTokens.has(token))
    })
    if (!existing) return node
    used.add(existing.id)
    return { ...node, existingWidgetId: existing.id }
  })
  return { ...plan, nodes }
}

// --- Compact local learning -------------------------------------------------

const SCENARIO_PREFS_KEY = 'grovepad:scenario-preferences:v1'
const SCENARIO_TOKEN_VOTES_KEY = 'grovepad:scenario-token-votes:v1'
type ScenarioPreferences = Record<string, Record<string, number>>
type ScenarioTokenVotes = Record<string, Record<string, number>>

function readScenarioPreferences(): ScenarioPreferences {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(SCENARIO_PREFS_KEY) ?? '') as ScenarioPreferences
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Called on commit so similar future thoughts lead with what this user
 *  actually picks. Entirely local. */
export function recordScenarioChoice(archetypeId: string, directionId: string, source = ''): void {
  if (typeof localStorage === 'undefined') return
  const preferences = readScenarioPreferences()
  const counts = preferences[archetypeId] ?? {}
  counts[directionId] = (counts[directionId] ?? 0) + 1
  preferences[archetypeId] = counts
  try { localStorage.setItem(SCENARIO_PREFS_KEY, JSON.stringify(preferences)) } catch { /* storage may be unavailable */ }
  if (source && !archetypeId.startsWith('compound:')) {
    let votes: ScenarioTokenVotes = {}
    try { votes = JSON.parse(localStorage.getItem(SCENARIO_TOKEN_VOTES_KEY) ?? '{}') as ScenarioTokenVotes } catch { /* use empty */ }
    for (const token of sourceTokens(source)) {
      if (token.length < 4) continue
      const byArchetype = votes[token] ?? {}
      byArchetype[archetypeId] = Math.min(12, (byArchetype[archetypeId] ?? 0) + 1)
      votes[token] = byArchetype
    }
    try { localStorage.setItem(SCENARIO_TOKEN_VOTES_KEY, JSON.stringify(votes)) } catch { /* storage may be unavailable */ }
  }
}

function learnedDirection(archetypeId: string): string | null {
  const counts = readScenarioPreferences()[archetypeId]
  if (!counts) return null
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return top && top[1] >= 2 ? top[0] : null
}

// --- Weighted local matching ------------------------------------------------

const DOMAIN_FRAMES: Record<ScenarioDomain, readonly string[]> = {
  learning: ['learn', 'study', 'teach', 'practice', 'exam', 'course'],
  career: ['work', 'job', 'career', 'interview', 'hire', 'manage', 'promotion'],
  money: ['save', 'spend', 'pay', 'debt', 'invest', 'money', 'budget'],
  home: ['home', 'house', 'move', 'garden', 'declutter', 'rent', 'renovate'],
  health: ['health', 'sleep', 'run', 'train', 'recover', 'meditate', 'symptom'],
  people: ['family', 'friend', 'relationship', 'wedding', 'baby', 'pet', 'care'],
  travel: ['travel', 'trip', 'visit', 'vacation', 'flight'],
  creative: ['write', 'draw', 'design', 'make', 'music', 'photo', 'film'],
  food: ['cook', 'eat', 'meal', 'recipe', 'food', 'grocery'],
  admin: ['organize', 'renew', 'apply', 'document', 'appointment', 'reset', 'inbox', 'email', 'paperwork'],
  business: ['business', 'product', 'launch', 'customer', 'market', 'sell'],
  community: ['club', 'event', 'volunteer', 'game', 'community', 'team'],
}

const NEGATED_SCENARIO = /\b(?:not|no longer|stopped|quit|gave up|cancelled|canceled)\b/i
const THIRD_PERSON_NARRATIVE = /\b(?:he|she|they|my (?:friend|sister|brother|coworker|colleague))\b[^.!?]{0,45}\b(?:was|were|had|did|learned|started|finished|planned)\b/i

function sourceTokens(source: string): Set<string> {
  return normalizeLanguage(source, SCENARIO_VOCABULARY).tokens
}

const SCENARIO_VOCABULARY = buildVocabulary(ARCHETYPES.flatMap((spec) => [
  spec.id, spec.label, spec.topicFallback, ...(spec.keywords ?? []), ...spec.patterns.map((pattern) => pattern.source),
]))

const MATCH_NOISE = new Set(['want', 'need', 'start', 'try', 'plan', 'manage', 'make', 'help', 'thing', 'stuff'])

function archetypeTokens(spec: ArchetypeSpec): Set<string> {
  return normalizeLanguage([
    spec.id, spec.label, spec.topicFallback, ...(spec.keywords ?? []), ...spec.patterns.map((pattern) => pattern.source),
  ].join(' ')).tokens
}

interface ArchetypeScore { spec: ArchetypeSpec; score: number; consumed: number; correctedSource: string }

export interface ArchetypeShortlistEntry {
  id: string
  label: string
  domain?: ScenarioDomain
  score: number
}

function scoreArchetype(spec: ArchetypeSpec, source: string, normalized: NormalizedLanguage, tokenVotes: ScenarioTokenVotes): ArchetypeScore | null {
  let consumed = 0
  for (const pattern of spec.patterns) {
    pattern.lastIndex = 0
    const originalMatch = pattern.exec(source)
    pattern.lastIndex = 0
    const correctedMatch = pattern.exec(normalized.correctedText)
    const match = originalMatch ?? correctedMatch
    if (match) consumed = Math.max(consumed, match[0].trim().length)
  }

  const tokens = new Set([...normalized.tokens].filter((token) => !MATCH_NOISE.has(token)))
  const targetTokens = archetypeTokens(spec)
  const overlap = [...tokens].filter((token) => targetTokens.has(token)).length
  const coverage = tokenCoverage(tokens, targetTokens)
  const frame = spec.domain ? DOMAIN_FRAMES[spec.domain] : []
  const frameHit = frame.some((word) => tokens.has(canonicalToken(word)))

  // Regexes remain a strong signal, but are no longer the candidate gate.
  // A non-regex candidate needs corroborating semantic evidence so a single
  // fuzzy word cannot hijack an unrelated thought.
  if (!consumed && !(overlap >= 2 || (overlap >= 1 && frameHit && tokens.size <= 4))) return null
  const regexCoverage = consumed / Math.max(source.length, 1)
  let score = consumed
    ? .58 + Math.min(.22, regexCoverage * .22) + Math.min(.12, coverage * .16)
    : .34 + Math.min(.4, coverage * .4) + Math.min(.14, overlap * .07)
  if (frameHit) score += .07
  if (!consumed && normalized.corrections.length) score += .025
  if (!consumed) {
    // Broad archetypes should not win a semantic tie merely because they list
    // more vocabulary. Reward concentrated evidence in the smaller, more
    // specific intent while keeping fuzzy-only confidence below exact matches.
    score = Math.min(.72, score) + Math.min(.07, (overlap / Math.sqrt(targetTokens.size)) * .08)
  }
  const personalVotes = [...tokens].reduce((total, token) => total + (tokenVotes[token]?.[spec.id] ?? 0), 0)
  score += Math.min(.08, personalVotes * .012)
  score += Math.max(-.08, Math.min(.08, spec.priority ?? 0))
  if (NEGATED_SCENARIO.test(source)) score -= .4
  if (THIRD_PERSON_NARRATIVE.test(source)) score -= .32
  return { spec, score: Math.max(0, Math.min(.99, score)), consumed, correctedSource: normalized.correctedText }
}

/**
 * Builds a compact semantic menu for the local intent router. Unlike
 * resolveScenario this deliberately has no confidence gate: the model needs
 * to be able to recover an archetype whose hand-written trigger did not fire.
 * It returns catalogue ids only; plans remain deterministic and curated.
 */
export function shortlistArchetypes(source: string, k = 15): ArchetypeShortlistEntry[] {
  const limit = Math.max(1, Math.min(24, Math.floor(k)))
  const normalized = normalizeLanguage(source.trim(), SCENARIO_VOCABULARY)
  const tokens = new Set([...normalized.tokens].filter((token) => !MATCH_NOISE.has(token)))
  return ARCHETYPES.map((spec) => {
    const strong = scoreArchetype(spec, source, normalized, {})
    if (strong) return { id: spec.id, label: spec.label, ...(spec.domain ? { domain: spec.domain } : {}), score: strong.score }
    const targets = archetypeTokens(spec)
    const overlap = [...tokens].filter((token) => targets.has(token)).length
    const frameHit = (spec.domain ? DOMAIN_FRAMES[spec.domain] : []).some((word) => tokens.has(canonicalToken(word)))
    const score = Math.max(0, Math.min(.47,
      overlap * .11 + tokenCoverage(tokens, targets) * .2 + (frameHit ? .08 : 0) + Math.max(0, spec.priority ?? 0),
    ))
    return { id: spec.id, label: spec.label, ...(spec.domain ? { domain: spec.domain } : {}), score }
  })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/** Read-only diagnostics for the existing AI debugger and regression tests. */
export function inspectScenarioMatches(source: string): {
  correctedText: string
  corrections: NormalizedLanguage['corrections']
  matches: Array<{ archetypeId: string; score: number; consumed: number }>
} {
  const normalized = normalizeLanguage(source, SCENARIO_VOCABULARY)
  const matches = ARCHETYPES
    .map((spec) => scoreArchetype(spec, source, normalized, {}))
    .filter((match): match is ArchetypeScore => Boolean(match))
    .sort((a, b) => b.score - a.score || b.consumed - a.consumed)
    .slice(0, 8)
    .map((match) => ({ archetypeId: match.spec.id, score: match.score, consumed: match.consumed }))
  return { correctedText: normalized.correctedText, corrections: normalized.corrections, matches }
}

export interface ScenarioCatalogueIssue { archetypeId: string; message: string }

/** Fast catalogue audit used by tests and development. */
export function validateScenarioCatalogue(catalogue: readonly ArchetypeSpec[] = ARCHETYPES): ScenarioCatalogueIssue[] {
  const issues: ScenarioCatalogueIssue[] = []
  const seen = new Set<string>()
  for (const spec of catalogue) {
    if (seen.has(spec.id)) issues.push({ archetypeId: spec.id, message: 'Duplicate archetype id' })
    seen.add(spec.id)
    const directionIds = new Set(spec.directions.map((direction) => direction.id))
    if (!directionIds.has('hub')) issues.push({ archetypeId: spec.id, message: 'Missing hub direction' })
    for (const direction of spec.directions) {
      if (!direction.widgets.length) issues.push({ archetypeId: spec.id, message: `Direction ${direction.id} has no widgets` })
      for (const widget of direction.widgets) {
        if (!WIDGET_REGISTRY[widget.type]) issues.push({ archetypeId: spec.id, message: `Unknown widget ${widget.type}` })
      }
    }
    for (const option of spec.question.options) {
      if (!directionIds.has(option.directionId)) issues.push({ archetypeId: spec.id, message: `Question points to ${option.directionId}` })
    }
  }
  return issues
}

function materializeArchetype(
  archetype: ArchetypeSpec,
  source: string,
  topic: string,
  specificity: SpecificityProfile,
  confidence: number,
  margin: number,
  alternatives: ScenarioResolution['alternatives'],
  context: ScenarioContext,
): ScenarioResolution {
  const contextNotes: string[] = []
  const canvasTypes = new Set((context.canvasWidgets ?? []).map((widget) => widget.type))
  const preferred = learnedDirection(archetype.id)
  const resolved: ResolvedDirection[] = archetype.directions.map((direction) => {
    const lead = direction.widgets[0]!.type
    const duplicate = canvasTypes.has(lead)
    return {
      id: direction.id,
      label: direction.label.replaceAll('{topic}', topic),
      tagline: direction.tagline,
      plan: reuseExistingNodes(buildPlan(source, topic, direction, confidence), context.canvasWidgets ?? []),
      ...(duplicate ? { note: `You already have a ${widgetDefinition(lead).label} on this canvas` } : {}),
    }
  })
  const rank = (direction: ResolvedDirection): number => {
    let score = direction.id === 'hub' ? 2 : 0
    if (preferred && direction.id === preferred) score += 4
    if (direction.note) score -= 3
    return score
  }
  resolved.sort((a, b) => rank(b) - rank(a))
  const recommended = resolved[0]!
  if (preferred && recommended.id === preferred && preferred !== 'hub') {
    contextNotes.push('Leading with your usual choice for this kind of thought')
  }
  if (context.canvasName) {
    const canvasTokens = new Set(context.canvasName.toLowerCase().match(/[\p{L}\d]{3,}/gu) ?? [])
    const overlaps = topic.toLowerCase().split(/\s+/).some((token) => token.length >= 3 && canvasTokens.has(token))
    if (overlaps) contextNotes.push(`Fits this “${context.canvasName}” canvas`)
  }
  return {
    archetypeId: archetype.id,
    archetypeLabel: archetype.label,
    topic,
    specificity,
    directions: resolved,
    recommendedId: recommended.id,
    question: archetype.question,
    contextNotes,
    matchConfidence: confidence,
    matchMargin: margin,
    ambiguous: alternatives.length > 0 && margin < .1,
    alternatives,
  }
}

/** Materializes a model-selected catalogue entry without trusting the model to
 * design nodes. The original source is still used for deterministic slot
 * extraction, so invented dates and amounts cannot hydrate widgets. */
export function resolveArchetypeById(
  archetypeId: string,
  topic: string | undefined,
  context: ScenarioContext = {},
): ScenarioResolution | null {
  const archetype = ARCHETYPES.find((entry) => entry.id === archetypeId)
  if (!archetype) return null
  const source = (context.sourceText ?? topic ?? archetype.topicFallback).trim().slice(0, 160)
  if (!source) return null
  const safeTopic = topic
    ? [...topic].map((char) => { const code = char.charCodeAt(0); return code < 32 || code === 127 ? ' ' : char }).join('').replace(/\s+/g, ' ').trim().slice(0, 28)
    : undefined
  const resolvedTopic = safeTopic && !STOP_TOPICS.test(safeTopic) ? titleCase(safeTopic) : extractTopic(archetype, source)
  const confidence = Math.max(0, Math.min(.99, context.routeConfidence ?? .55))
  return materializeArchetype(archetype, source, resolvedTopic, analyzeSpecificity(source), confidence, confidence, [], context)
}

// --- Main entry ---------------------------------------------------------------

/**
 * Returns a scenario resolution for vague-but-understood thoughts, or null
 * when the thought is specific enough that ordinary widget prediction
 * should lead (explicit requests, outlines, action items). This is the
 * cost-of-being-wrong gate: multi-widget scenario plans only ever appear
 * as reviewable proposals for genuinely open-ended input.
 */
export function resolveScenario(sourceText: string, context: ScenarioContext = {}): ScenarioResolution | null {
  const source = sourceText.trim()
  if (!source || source.length > 160) return null

  const specificity = analyzeSpecificity(source)
  // Specific enough to act on directly? Let the widget predictor lead —
  // unless a curated trigger consumes most of the sentence ("make this make
  // sense", "make me productive"): an action verb at the start of a stock
  // plea is not a concrete instruction.
  if (specificity.immediateGoal >= 0.6 || specificity.desiredOutput >= 0.6) {
    const corrected = normalizeLanguage(source, SCENARIO_VOCABULARY).correctedText
    const consumedMost = ARCHETYPES.some((spec) => spec.patterns.some((pattern) => {
      pattern.lastIndex = 0
      const match = pattern.exec(source) ?? (pattern.lastIndex = 0, pattern.exec(corrected))
      pattern.lastIndex = 0
      return match !== null && match[0].trim().length / source.length >= 0.55
    }))
    if (!consumedMost) return null
  }

  // Split only explicit first-person/additive pivots. Plain noun phrases such
  // as "health and fitness" stay intact and are scored as one scenario.
  if (!context.forceArchetypeId) {
    const parts = source.split(/\s+(?:and|also|plus)\s+(?=(?:i|i'm|im|we|my|our)\b)/i)
      .map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) {
      const resolutions = parts.map((part) => resolveScenario(part, context)).filter((item): item is ScenarioResolution => Boolean(item))
      if (resolutions.length === parts.length) {
        const nodes: ProposedNode[] = []
        const relations: ThoughtPlan['relations'] = []
        const groups: ThoughtPlan['groups'] = []
        resolutions.forEach((resolution, groupIndex) => {
          const plan = resolution.directions.find((entry) => entry.id === resolution.recommendedId)?.plan
          if (!plan) return
          const prefix = `part-${groupIndex}-`
          nodes.push(...plan.nodes.map((node) => ({ ...node, temporaryId: prefix + node.temporaryId })))
          relations.push(...plan.relations.map((relation) => ({
            ...relation,
            fromTemporaryId: prefix + relation.fromTemporaryId,
            toTemporaryId: prefix + relation.toTemporaryId,
          })))
          groups.push(...plan.groups.map((group) => ({
            ...group,
            temporaryId: prefix + group.temporaryId,
            memberTemporaryIds: group.memberTemporaryIds.map((member) => prefix + member),
          })))
        })
        const confidence = Math.min(...resolutions.map((resolution) => resolution.matchConfidence))
        const combinedPlan: ThoughtPlan = { sourceText: source, confidence, nodes, relations, groups, warnings: [] }
        return {
          archetypeId: `compound:${resolutions.map((resolution) => resolution.archetypeId).join('+')}`,
          archetypeLabel: resolutions.map((resolution) => resolution.archetypeLabel).join(' + '),
          topic: resolutions.map((resolution) => resolution.topic).join(' + '),
          specificity,
          directions: [{ id: 'combined', label: 'Combined workspace', tagline: 'Both parts, kept as clear local clusters', plan: combinedPlan }],
          recommendedId: 'combined',
          question: { prompt: 'Keep both parts together?', options: [{ label: 'Keep both', directionId: 'combined' }] },
          contextNotes: ['Understood this as two related goals'],
          matchConfidence: confidence,
          matchMargin: Math.min(...resolutions.map((resolution) => resolution.matchMargin)),
          ambiguous: false,
          alternatives: [],
        }
      }
    }
  }

  let tokenVotes: ScenarioTokenVotes = {}
  if (typeof localStorage !== 'undefined') {
    try { tokenVotes = JSON.parse(localStorage.getItem(SCENARIO_TOKEN_VOTES_KEY) ?? '{}') as ScenarioTokenVotes } catch { /* use empty */ }
  }
  const normalized = normalizeLanguage(source, SCENARIO_VOCABULARY)
  const matches = ARCHETYPES
    .map((spec) => scoreArchetype(spec, source, normalized, tokenVotes))
    .filter((match): match is ArchetypeScore => Boolean(match))
    .sort((a, b) => b.score - a.score || b.consumed - a.consumed)
  const forced = context.forceArchetypeId ? matches.find((match) => match.spec.id === context.forceArchetypeId) : undefined
  const winner = forced ?? matches[0]
  if (!winner || winner.score < .48) return null
  const archetype = winner.spec
  const runnerUp = matches.find((match) => match.spec.id !== archetype.id)
  const margin = runnerUp ? winner.score - runnerUp.score : winner.score
  const alternatives = matches
    .filter((match) => match.spec.id !== archetype.id && winner.score - match.score < .14)
    .slice(0, 2)
    .map((match) => ({ archetypeId: match.spec.id, label: match.spec.label, score: match.score }))

  return materializeArchetype(
    archetype,
    source,
    extractTopic(archetype, winner.correctedSource),
    specificity,
    winner.score,
    margin,
    alternatives,
    context,
  )
}
