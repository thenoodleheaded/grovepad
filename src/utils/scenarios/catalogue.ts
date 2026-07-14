import type { ModuleType } from '../../types/spatial'
import type { ArchetypeSpec, ScenarioDomain } from '../scenarioResolver'

type CompactEntry = readonly [id: string, label: string, trigger: string, widgets?: readonly ModuleType[], tone?: 'standard' | 'gentle']

const DOMAIN_WIDGETS: Record<ScenarioDomain, readonly ModuleType[]> = {
  learning: ['study_goal', 'checklist', 'reading_list'],
  career: ['kanban', 'checklist', 'contact'],
  money: ['budget', 'goal_tracker', 'table'],
  home: ['checklist', 'budget', 'calendar'],
  health: ['logbook', 'calendar', 'notes'],
  people: ['checklist', 'contact', 'calendar'],
  travel: ['daily_agenda', 'checklist', 'budget'],
  creative: ['outline', 'checklist', 'media'],
  food: ['weekly_planner', 'checklist', 'budget'],
  admin: ['checklist', 'calendar', 'links'],
  business: ['kanban', 'metrics', 'budget'],
  community: ['calendar', 'contact', 'checklist'],
}

function words(id: string): string[] { return id.split('-') }
function human(id: string): string { return words(id).map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ') }
function titleFor(type: ModuleType, label: string): string {
  if (type === 'checklist') return `${label} next steps`
  if (type === 'budget') return `${label} budget`
  if (type === 'calendar') return `${label} dates`
  if (type === 'contact') return `${label} people`
  if (type === 'notes') return `${label} notes`
  if (type === 'reading_list' || type === 'links') return `${label} resources`
  if (type === 'metrics' || type === 'goal_tracker' || type === 'study_goal') return `${label} progress`
  return `${label} ${type.replaceAll('_', ' ')}`
}

function compact(domain: ScenarioDomain, entries: readonly CompactEntry[]): ArchetypeSpec[] {
  return entries.map(([id, suppliedLabel, trigger, suppliedWidgets, suppliedTone]) => {
    const label = suppliedLabel || human(id)
    const widgets = suppliedWidgets ?? DOMAIN_WIDGETS[domain]
    const [lead, ...rest] = widgets
    return {
      id,
      label,
      domain,
      tone: suppliedTone ?? (domain === 'health' ? 'gentle' : 'standard'),
      priority: 0,
      keywords: [...words(id), ...trigger.toLowerCase().replace(/[^a-z| ]/g, ' ').split(/[ |]+/).filter((word) => word.length > 2)],
      patterns: [new RegExp(`\\b(?:${trigger})\\b`, 'i')],
      topicFallback: label,
      directions: [
        { id: 'hub', label: `${label} workspace`, tagline: suppliedTone === 'gentle' || domain === 'health' ? 'A quiet place to organise what matters' : 'A useful starting point you can shape', widgets: widgets.map((type) => ({ type, title: titleFor(type, label) })) },
        { id: 'focus', label: 'Start focused', tagline: 'Only the essentials for the next step', widgets: [lead!, ...rest.slice(0, 1)].map((type) => ({ type, title: titleFor(type, label) })) },
      ],
      question: { prompt: 'What would help most right now?', options: [
        { label: 'The full picture', directionId: 'hub' },
        { label: 'Just the next step', directionId: 'focus' },
      ] },
    }
  })
}

const LEARNING_ARCHETYPES = compact('learning', [
  ['online-course', 'Online course', 'online course|udemy course|coursera course|taking a course'],
  ['school-semester', 'School semester', 'new semester|back to school|school year'],
  ['thesis', 'Thesis', 'thesis|dissertation'],
  ['college-applications', 'College applications', 'college applications?|university applications?|applying to college'],
  ['scholarship-hunt', 'Scholarship hunt', 'scholarships?|funding my degree'],
  ['memorization', 'Memorization', 'memorize|memorising|memorizing|learn my lines'],
  ['group-study', 'Study group', 'study group|group revision'],
  ['teach-class', 'Teaching', 'teaching a class|teaching a workshop|going to teach'],
  ['kids-homework', 'Kids homework', 'kids? homework|helping my kid with school'],
  ['second-brain', 'Second brain', 'second brain|organize my notes|knowledge is scattered'],
  ['choose-school', 'Choose a school', 'choosing a school|compare schools|which university'],
])

const CAREER_ARCHETYPES = compact('career', [
  ['interview-prep', 'Interview preparation', 'interview (?:on|this|next)|prepar(?:e|ing) for (?:a |an )?(?:job )?interview|interview prep', ['flashcards', 'checklist', 'countdown']],
  ['new-job', 'Starting a new job', 'starting a new job|new job monday|first week at work'],
  ['promotion-push', 'Promotion push', 'want a promotion|asking for a raise|promotion plan'],
  ['performance-review', 'Performance review', 'performance review|self assessment|review season'],
  ['quarterly-goals', 'Quarterly goals', 'quarterly goals|okrs?|goals for q[1-4]'],
  ['manage-team', 'Managing a team', 'managing a team|new manager|lead my team'],
  ['hiring', 'Hiring', 'hiring for|recruiting|fill a role'],
  ['freelance', 'Freelancing', 'going freelance|freelancing|first clients'],
  ['salary-negotiation', 'Salary negotiation', 'salary negotiation|negotiating an offer|negotiate my salary'],
  ['career-change', 'Career change', 'changing careers?|switching careers?|career pivot'],
  ['conference-trip', 'Conference', 'going to a conference|conference trip'],
  ['presentation-prep', 'Presentation preparation', 'giving a talk|presentation coming|prepare my presentation'],
  ['resignation', 'Resignation', 'resigning|handing in my notice|leaving my job', ['checklist', 'timeline', 'notes'], 'gentle'],
  ['portfolio-build', 'Portfolio', 'build my portfolio|need a portfolio|showcase my work'],
  ['client-management', 'Client management', 'manage clients|client work|juggling clients'],
])

const MONEY_ARCHETYPES = compact('money', [
  ['debt-payoff', 'Debt payoff', 'pay off (?:my )?debt|credit card debt|get out of debt'],
  ['emergency-fund', 'Emergency fund', 'emergency fund|safety net'],
  ['start-investing', 'Start investing', 'start investing|begin investing|invest my savings'],
  ['retirement-planning', 'Retirement planning', 'retirement plan|plan for retirement|saving enough for retirement'],
  ['tax-season', 'Tax season', 'do my taxes|tax season|tax deadline'],
  ['subscription-audit', 'Subscription audit', 'too many subscriptions|cancel subscriptions|subscription audit'],
  ['net-worth', 'Net worth', 'track my net worth|net worth'],
  ['shared-expenses', 'Shared expenses', 'split rent|shared expenses|who owes what'],
  ['sell-stuff', 'Sell things', 'sell my old stuff|declutter and sell|selling things'],
  ['charitable-giving', 'Charitable giving', 'plan my donations|charitable giving|give more'],
  ['insurance-shopping', 'Insurance comparison', 'compare insurance|choosing insurance|insurance policies'],
  ['invoicing', 'Invoicing', 'send invoices|track invoices|client invoices'],
  ['money-checkup', 'Money checkup', 'money checkup|check my finances|financial check in|where is my money going', ['subscriptions', 'debt_payoff', 'budget']],
])

const HOME_ARCHETYPES = compact('home', [
  ['declutter', 'Decluttering', 'declutter|too much stuff|clear out the house'],
  ['cleaning-routine', 'Cleaning routine', 'cleaning routine|cleaning schedule|keep the house clean'],
  ['garden', 'Garden', 'start a garden|growing vegetables|plan my garden'],
  ['houseplants', 'Houseplants', 'houseplants|keep my plants alive|watering plants'],
  ['home-maintenance', 'Home maintenance', 'home maintenance|house maintenance|repairs around the house'],
  ['interior-design', 'Interior design', 'interior design|redecorate|redecorating|design my room'],
  ['smart-home', 'Smart home', 'smart home|home automation'],
  ['emergency-prep', 'Emergency preparation', 'emergency kit|storm preparation|emergency prep'],
  ['home-inventory', 'Home inventory', 'home inventory|document our stuff|insurance inventory'],
  ['rent-out-space', 'Rent out a space', 'renting out|airbnb|spare room'],
  ['car-ownership', 'Car ownership', 'car maintenance|look after my car|car expenses'],
  ['warranty-receipts', 'Warranties and receipts', 'warranties|receipts|proof of purchase'],
  ['household-os', 'Household OS', 'household system|run the house|home admin|household routine', ['chore_rotation', 'home_maintenance', 'meal_planner']],
])

const HEALTH_ARCHETYPES = compact('health', [
  ['running-program', 'Running program', 'couch to 5k|training for a 5k|training for a 10k|running program'],
  ['strength-program', 'Strength program', 'start (?:lifting|strength training)|strength (?:program|training)|get stronger'],
  ['weight-management', 'Weight management', 'manage my weight|lose a few kilos|healthier weight'],
  ['sleep', 'Sleep', 'fix my sleep|sleeping badly|sleep routine'],
  ['rehab', 'Recovery and rehab', 'recovering from|rehab|physio exercises'],
  ['appointments', 'Appointments', 'doctor appointments?|medical appointments?|doctor stuff'],
  ['medication-routine', 'Medication routine', 'remember my meds|medication routine'],
  ['meditation', 'Meditation', 'start meditation|meditate regularly|mindfulness'],
  ['symptom-journal', 'Symptom journal', 'symptom journal|track my migraines|track symptoms'],
  ['nutrition-awareness', 'Nutrition awareness', 'eat better|track what i eat|nutrition'],
  ['diet-transition', 'Diet transition', 'change my diet|going vegetarian|diet transition'],
])

const PEOPLE_ARCHETYPES = compact('people', [
  ['wedding', 'Wedding', 'planning (?:our|a) wedding|wedding planning'],
  ['gift-planning', 'Gift planning', 'gift ideas|christmas shopping|plan gifts'],
  ['keep-in-touch', 'Keep in touch', 'stay in touch|keep in touch|call people more'],
  ['new-baby', 'New baby', 'having a baby|new baby|expecting a baby'],
  ['kids-activities', 'Kids activities', 'kids activities|children schedules?|juggling the kids'],
  ['new-pet', 'New pet', 'new pet|getting a dog|getting a cat|adopting a pet'],
  ['eldercare', 'Eldercare', 'eldercare|caring for (?:my )?(?:mom|dad|parent)|aging parent', ['notes', 'contact', 'calendar'], 'gentle'],
  ['family-tree', 'Family tree', 'family tree|family history|genealogy'],
  ['co-parenting', 'Co-parenting', 'co-parenting|shared custody', ['calendar', 'notes', 'contact'], 'gentle'],
  ['long-distance', 'Long-distance relationship', 'long distance relationship|partner lives away'],
  ['celebration-surprise', 'Celebration surprise', 'surprise party|plan a surprise|special celebration'],
  ['dinner-party', 'Dinner party', 'dinner party|hosting dinner|people coming for dinner'],
  ['stay-in-touch', 'Stay in touch', 'stay in touch|call my friends|keep up with friends|reach out more', ['keep_in_touch', 'contact']],
  ['event-hosting', 'Event hosting', 'hosting an event|plan a party|guest list|rsvps?', ['guest_list', 'recipe', 'budget']],
])

const TRAVEL_ARCHETYPES = compact('travel', [
  ['road-trip', 'Road trip', 'road trip|driving across|cross country drive'],
  ['camping', 'Camping trip', 'camping trip|going camping'],
  ['long-travel', 'Long-term travel', 'long term travel|travel for months|backpacking'],
  ['business-travel', 'Business travel', 'business trip|travel for work'],
  ['move-abroad', 'Moving abroad', 'moving abroad|move to another country|relocating overseas'],
  ['bucket-list', 'Travel bucket list', 'travel bucket list|places i want to visit'],
])

const CREATIVE_ARCHETYPES = compact('creative', [
  ['photography-project', 'Photography project', 'photography project|photo series|shooting photos'],
  ['music-making', 'Music project', 'making music|record an album|write a song|music project'],
  ['game-dev', 'Game development', 'mak(?:e|ing) a game|game dev|build(?:ing)? a game|create a game|my own game'],
  ['craft-project', 'Craft project', 'craft project|crochet project|knitting project|woodworking project'],
  ['daily-art-practice', 'Daily art practice', 'draw every day|daily art|art practice'],
  ['blog-newsletter', 'Blog or newsletter', 'start a blog|newsletter|write online'],
  ['podcast', 'Podcast', 'start a podcast|podcast project'],
  ['video-channel', 'Video channel', 'youtube channel|video channel|make videos'],
  ['content-calendar', 'Content calendar', 'content calendar|plan my content|social posts'],
  ['submissions', 'Creative submissions', 'submit my work|submission deadlines|send to publishers'],
])

const FOOD_ARCHETYPES = compact('food', [
  ['baking-project', 'Baking project', 'baking project|learn to bake|bake more'],
  ['recipe-development', 'Recipe development', 'develop a recipe|test recipes|recipe ideas'],
  ['preserving', 'Food preserving', 'canning|preserving food|make preserves'],
  ['restaurant-list', 'Restaurant list', 'restaurants? to try|restaurant list|places to eat'],
  ['tasting-journal', 'Tasting journal', 'tasting journal|wine notes|coffee tasting'],
  ['holiday-season', 'Holiday food', 'holiday cooking|christmas dinner|thanksgiving food'],
])

const ADMIN_ARCHETYPES = compact('admin', [
  ['digital-cleanup', 'Digital cleanup', 'digital cleanup|organize my files|clean up my computer'],
  ['email-overload', 'Email overload', 'email overload|inbox is a mess|too many emails'],
  ['bureaucracy', 'Paperwork', 'paperwork|bureaucracy|forms to complete'],
  ['immigration-process', 'Immigration process', 'immigration process|visa application|residency application'],
  ['insurance-claim', 'Insurance claim', 'insurance claim|file a claim'],
  ['benefits-application', 'Benefits application', 'benefits application|apply for benefits'],
  ['estate-planning', 'Estate planning', 'estate planning|write a will|organize my affairs', ['notes', 'checklist', 'contact'], 'gentle'],
  ['find-provider', 'Find a provider', 'find a doctor|find a therapist|find a contractor|choose a provider'],
  ['life-reset', 'Life reset', 'get my life together|life together|fresh start|reset my life', ['priority_matrix', 'checklist', 'habit']],
  ['sort-my-thoughts', 'Sort things out', "help|where do i (?:even )?start|what (?:do|should) i do first|make this make sense|too much going on|overwhelmed|a million ideas|too many ideas|brain dump|untangle", ['priority_matrix', 'checklist', 'notes']],
  ['get-productive', 'Get productive', 'make me productive|be (?:more )?productive|stop procrastinating|procrastinat(?:e|ing|ion)|get focused|deep work|waste less time', ['daily_agenda', 'pomodoro', 'habit']],
  ['new-routine', 'New routine', '(?:new|better|daily|morning|evening) routine|build a routine|need a routine|stick to a routine', ['sequencer', 'habit', 'weekly_planner']],
  ['room-refresh', 'Room refresh', 'fix my room|clean my room|organi[sz]e my room|room makeover|sort out my room', ['checklist', 'sketchpad', 'budget']],
  ['school-organization', 'School organization', 'organi[sz]e school|school stuff|keep up with school|on top of school|school work is', ['assignment', 'weekly_planner', 'study_goal']],
  ['money-basics', 'Money basics', 'less broke|stop being broke|save more money|no money left|money is tight|money stress', ['budget', 'subscriptions', 'goal_tracker']],
  ['moving-house', 'Moving', 'moving (?:out|house|home|apartment|to a new)|move out|(?:buy|need) for moving|moving checklist|packing to move', ['checklist', 'budget', 'calendar']],
])

const BUSINESS_ARCHETYPES = compact('business', [
  ['product-launch', 'Product launch', 'product launch|launch my product|shipping a product'],
  ['marketing-campaign', 'Marketing campaign', 'marketing campaign|promote my product|ad campaign'],
  ['competitor-analysis', 'Competitor analysis', 'competitor analysis|research competitors'],
  ['customer-feedback', 'Customer feedback', 'customer feedback|user feedback|survey customers'],
  ['pricing-strategy', 'Pricing strategy', 'pricing strategy|set my price|how much to charge'],
  ['stock-inventory', 'Stock inventory', 'track our stock|business inventory|low stock'],
  ['sell-vehicle', 'Sell a vehicle', 'sell my car|selling a vehicle'],
])

const COMMUNITY_ARCHETYPES = compact('community', [
  ['volunteering', 'Volunteering', 'start volunteering|volunteer work'],
  ['run-a-club', 'Run a club', 'run a club|book club|community club'],
  ['fundraiser', 'Fundraiser', 'fundraiser|raise money for'],
  ['religious-season', 'Religious season', 'ramadan planning|advent|lent planning'],
  ['coach-team', 'Coach a team', 'coaching a team|coach my kids team'],
  ['tournament', 'Tournament', 'organize a tournament|tournament planning'],
  ['collection', 'Collection', 'organize my collection|vinyl collection|card collection'],
])

export const EXTENDED_ARCHETYPES: readonly ArchetypeSpec[] = [
  ...LEARNING_ARCHETYPES, ...CAREER_ARCHETYPES, ...MONEY_ARCHETYPES, ...HOME_ARCHETYPES,
  ...HEALTH_ARCHETYPES, ...PEOPLE_ARCHETYPES, ...TRAVEL_ARCHETYPES, ...CREATIVE_ARCHETYPES,
  ...FOOD_ARCHETYPES, ...ADMIN_ARCHETYPES, ...BUSINESS_ARCHETYPES, ...COMMUNITY_ARCHETYPES,
]
