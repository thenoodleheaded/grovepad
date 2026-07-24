import { detectDate, interpretThoughtCandidates, interpretThought, recordInterpretationChoice } from '../utils/thoughtInterpreter'
import type { InterpretationContext, ProposedNode, ThoughtInterpretation, ThoughtPlan, ThoughtPrediction } from '../utils/thoughtInterpreter'
import { planStructuralRequest } from '../utils/structuralPlanner'
import { buildScaffold } from '../utils/scaffoldPlanner'
import { inspectScenarioMatches, shortlistArchetypes, type ArchetypeShortlistEntry } from '../utils/scenarioResolver'
import { widgetDefinition } from '../widgets/registry'
import { useAiDebugStore } from '../store/useAiDebugStore'
import { buildLocalAiPlanSystemPrompt, extractLocalAiPlanJson, LOCAL_MODEL_PLAN_JSON_SCHEMA, parseLocalAiPlan } from './local-ai/planProtocol'
import { detectRuntime, type DetectedRuntime } from './local-ai/modelProfiles'
import {
  createCapacitorLocalAiAdapter,
  createTauriLocalAiAdapter,
  createWebLlmAdapter,
  disposeCachedWebLlmEngine,
  isAbortError,
  type LocalAiModelProfile,
  type LocalAiRuntimeAdapter,
} from './local-ai'

const ENABLED_KEY = 'grovepad:local-ai-enabled:v1'
const CACHE_LIMIT = 24

type LocalAiPhase = 'heuristic'|'available'|'downloading'|'ready'|'thinking'|'error'|'unsupported'
export interface LocalAiStatus { phase:LocalAiPhase; tier:string; modelId:string|null; progress:number; message:string; enabled:boolean }
export interface PredictionOptions { signal?:AbortSignal; allowModel?:boolean; mode?:'fast'|'deep'|'compose'; skeleton?:ThoughtPlan }
interface StorageLike { getItem(key:string):string|null; setItem(key:string,value:string):void }
interface ServiceOptions { runtime?:DetectedRuntime; storage?:StorageLike|null; enabled?:boolean; adapterFactory?:()=>LocalAiRuntimeAdapter|null }

function abortError(): DOMException { return new DOMException('Local AI request was cancelled','AbortError') }
function cacheKey(source:string,context:InterpretationContext,mode:'fast'|'deep'|'compose',skeleton?:ThoughtPlan){
  const skeletonKey=skeleton?.nodes.map(node=>`${node.temporaryId}:${node.widgetType}`).join(',')??''
  return `${mode}|${source.trim().toLocaleLowerCase()}|${context.selectedWidgetType??''}|${context.selectedWidgetTitle??''}|${skeletonKey}`
}
function traceLabel(source:string):string{return source.trim().replace(/\s+/g,' ').slice(0,72)||'Empty Quick Add input'}
function tracePrompt(source:string,context:InterpretationContext):string{return `[user]\n${source}\n\n[context]\n${JSON.stringify(context)}`}
function compactInterpretation(interpretation:ThoughtInterpretation):string{
  return JSON.stringify({
    recommendedId:interpretation.recommendedId,
    confidenceMargin:interpretation.confidenceMargin,
    scenarioRoute:interpretation.scenarioRoute,
    predictions:interpretation.predictions.map(prediction=>({
      id:prediction.id,label:prediction.label,kind:prediction.kind,confidence:prediction.confidence,
      nodes:prediction.plan.nodes.map(node=>({type:node.widgetType,title:node.title,depth:node.depth})),
      relations:prediction.plan.relations.map(relation=>({from:relation.fromTemporaryId,to:relation.toTemporaryId,type:relation.type})),
    })),
  },null,2)
}
function planSummary(plan:ThoughtPlan|null):string{
  return plan?`${plan.nodes.length} nodes · ${plan.relations.length} relations · validated locally`:'Invalid model plan rejected; deterministic result retained'
}
type FastRoute={route:string;confidence:number;topic?:string;date?:string;amount?:string}
type RecipeCandidate={id:string;kind:'recipe';prediction:ThoughtPrediction}
type ArchetypeCandidate={id:string;kind:'archetype';archetype:ArchetypeShortlistEntry}
type FastCandidate=RecipeCandidate|ArchetypeCandidate
function fastCandidates(interpretation:ThoughtInterpretation,sourceText:string):FastCandidate[]{
  const recipes:RecipeCandidate[]=interpretation.predictions.slice(0,5).map((prediction,index)=>({id:`r${index}`,kind:'recipe',prediction}))
  const archetypes:ArchetypeCandidate[]=shortlistArchetypes(sourceText,15).map(archetype=>({id:`a:${archetype.id}`,kind:'archetype',archetype}))
  return [...recipes,...archetypes]
}
function fastRouterPrompt(candidates:FastCandidate[]):string{
  return [
    '/no_think',
    'Choose the supplied route that best matches the user. Return JSON only: {"route":"r0","topic":"optional","date":"optional","amount":"optional","c":0.0}.',
    'Do not design widgets. Do not explain. Pick one supplied route. Omit slots that are not clearly stated.',
    'Candidates:',
    ...candidates.map(candidate=>candidate.kind==='recipe'
      ? `${candidate.id}|recipe|${candidate.prediction.label}|${candidate.prediction.primaryTypes.join(',')}`
      : `${candidate.id}|scenario|${candidate.archetype.label}|${candidate.archetype.domain??'general'}`),
  ].join('\n')
}
function fastRouterSchema(candidates:FastCandidate[]){
  return {type:'object',additionalProperties:false,required:['route','c'],properties:{route:{enum:candidates.map(candidate=>candidate.id)},topic:{type:'string',maxLength:48},date:{type:'string',maxLength:40},amount:{type:'string',maxLength:40},c:{type:'number',minimum:0,maximum:1}}}
}
function safeSlot(value:unknown,maxLength:number):string|undefined{
  if(typeof value!=='string')return undefined
  const cleaned=[...value].map(char=>{const code=char.charCodeAt(0);return code<32||code===127?' ':char}).join('').replace(/\s+/g,' ').trim()
  return cleaned?cleaned.slice(0,maxLength):undefined
}
function parseFastRoute(raw:string,candidates:FastCandidate[],sourceText:string):FastRoute|null{
  const value=extractLocalAiPlanJson(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const record=value as Record<string,unknown>
  const route=typeof record.route==='string'?record.route:typeof record.id==='string'?record.id:null
  if(!route||!candidates.some(candidate=>candidate.id===route)||typeof record.c!=='number'||!Number.isFinite(record.c)||record.c<0||record.c>1)return null
  const proposedTopic=safeSlot(record.topic,28)
  const sourceWords=new Set(sourceText.toLocaleLowerCase().match(/[\p{L}\d]{3,}/gu)??[])
  const topicWords=proposedTopic?.toLocaleLowerCase().match(/[\p{L}\d]{3,}/gu)??[]
  const topic=proposedTopic&&topicWords.some(word=>sourceWords.has(word))?proposedTopic:undefined
  // Model slots are accepted only when the deterministic extractors can
  // independently find the same kind of value in the source text.
  const deterministicDate=detectDate(sourceText)??undefined
  const deterministicAmount=sourceText.match(/(?:[$€£¥]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|gbp|dollars?|euros?|pounds?))/i)?.[0]
  return {
    route,confidence:record.c,
    ...(topic?{topic}:{}),
    ...(record.date!==undefined&&deterministicDate?{date:deterministicDate}:{}),
    ...(record.amount!==undefined&&deterministicAmount?{amount:deterministicAmount}:{}),
  }
}

/**
 * A quantified structural request ("3 topics, 5 subtopics each…") is built
 * deterministically and leads the candidate list on every tier — the model
 * never authors this structure. When a model is available it may only
 * rename the placeholder branch titles afterwards.
 */
function withStructuralPlan(deterministic:ThoughtInterpretation,source:string):ThoughtInterpretation{
  const plan=planStructuralRequest(source)
  if(!plan)return deterministic
  const prediction:ThoughtPrediction={
    id:'structural',
    label:plan.nodes[0]?.title??'Structured plan',
    explanation:'Counts in the request are built exactly as stated — structure never comes from a model',
    confidence:.95,
    plan,
    primaryTypes:[...new Set(plan.nodes.map(node=>node.widgetType))].slice(0,5),
    kind:'combined',
  }
  const predictions=[prediction,...deterministic.predictions].slice(0,4)
  return {...deterministic,predictions,recommendedId:prediction.id,confidenceMargin:.95-(predictions[1]?.confidence??0),shouldAutoCommit:false}
}

/**
 * Compose mode leads with the heuristic scaffold: a guaranteed archetype-
 * shaped starter tree built in microseconds. This is what a low-confidence
 * thought shows instead of a Notes fallback. The model may elaborate the
 * scaffold (rename branches, add a few connected nodes) but never replace
 * its structure, and the scaffold alone is always committable.
 */
function withScaffoldPlan(deterministic:ThoughtInterpretation,source:string):{interpretation:ThoughtInterpretation;skeleton:ThoughtPlan|null}{
  const explicitPlan=deterministic.predictions[0]
  // Compose is a rescue path for genuinely ambiguous notes, not permission
  // to replace a usable literal plan. Lists and explicit widget requests keep
  // their nouns, cardinality, Unicode, and requested widget type intact.
  if(explicitPlan&&explicitPlan.kind!=='fallback'&&explicitPlan.confidence>=.56){
    return {interpretation:deterministic,skeleton:explicitPlan.plan}
  }
  const scaffold=buildScaffold(source,{clauses:deterministic.meaning.clauses})
  if(!scaffold)return {interpretation:deterministic,skeleton:null}
  const prediction:ThoughtPrediction={
    id:'scaffold',
    label:scaffold.archetypeId==='generic'?'Starter structure':`${scaffold.archetypeLabel} starter`,
    explanation:'Instant starter tree from the closest life scenario — refined locally when a model is available',
    confidence:.62,
    plan:scaffold.plan,
    primaryTypes:[...new Set(scaffold.plan.nodes.map(node=>node.widgetType))].slice(0,5),
    kind:'combined',
  }
  const predictions=[prediction,...deterministic.predictions.filter(entry=>entry.id!=='scaffold')].slice(0,4)
  return {
    interpretation:{...deterministic,predictions,recommendedId:prediction.id,confidenceMargin:prediction.confidence-(predictions[1]?.confidence??0),shouldAutoCommit:false},
    skeleton:scaffold.plan,
  }
}

/** Placeholder-titled structure nodes the model is allowed to rename. */
function structuralTitleTargets(plan:ThoughtPlan):ProposedNode[]{
  return plan.nodes.filter(node=>node.widgetType==='notes').slice(0,24)
}
function titleEnrichPrompt(source:string,targets:readonly ProposedNode[]):string{
  return [
    '/no_think',
    'Rename placeholder outline titles so each names real content for the user request.',
    'Return JSON only: {"titles":[{"id":"s-1","title":"Integration Techniques"}]}.',
    'Only use supplied ids. Keep every title under 60 characters. Do not add or remove nodes.',
    `User request: ${source}`,
    'Nodes (id|placeholder):',
    ...targets.map(node=>`${node.temporaryId}|${node.title}`),
  ].join('\n')
}
function titleEnrichSchema(ids:readonly string[]){
  return {type:'object',additionalProperties:false,required:['titles'],properties:{titles:{type:'array',maxItems:ids.length,items:{type:'object',additionalProperties:false,required:['id','title'],properties:{id:{enum:[...ids]},title:{type:'string',minLength:1,maxLength:80}}}}}}
}
/** Applies validated renames to a cloned plan. Ids outside the skeleton are
 *  ignored; structure (nodes, relations) is never touched. */
function applyEnrichedTitles(prediction:ThoughtPrediction,raw:string,allowed:ReadonlySet<string>):ThoughtPrediction|null{
  const value=extractLocalAiPlanJson(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const titles=(value as Record<string,unknown>).titles
  if(!Array.isArray(titles))return null
  const renames=new Map<string,string>()
  for(const item of titles){
    if(typeof item!=='object'||item===null||Array.isArray(item))continue
    const record=item as Record<string,unknown>
    if(typeof record.id!=='string'||!allowed.has(record.id)||typeof record.title!=='string')continue
    const title=record.title.trim().slice(0,80)
    if(title)renames.set(record.id,title)
  }
  if(renames.size===0)return null
  const plan:ThoughtPlan={
    ...prediction.plan,
    nodes:prediction.plan.nodes.map(node=>renames.has(node.temporaryId)?{...node,title:renames.get(node.temporaryId)!}:node),
  }
  return {...prediction,plan,explanation:'Structure built deterministically; the local model named the branches'}
}

function respectsDeepSkeleton(plan:ThoughtPlan,skeleton:ThoughtPlan,maxExtras:number):boolean{
  const planNodes=new Map(plan.nodes.map(node=>[node.temporaryId,node]))
  const skeletonIds=new Set(skeleton.nodes.map(node=>node.temporaryId))
  if(plan.nodes.length-skeleton.nodes.length>maxExtras)return false
  for(const node of skeleton.nodes){
    if(planNodes.get(node.temporaryId)?.widgetType!==node.widgetType)return false
  }
  const relationKey=(from:string,to:string,type:string)=>`${from}\u0000${to}\u0000${type}`
  const planRelations=new Set(plan.relations.map(relation=>relationKey(relation.fromTemporaryId,relation.toTemporaryId,relation.type)))
  if(skeleton.relations.some(relation=>!planRelations.has(relationKey(relation.fromTemporaryId,relation.toTemporaryId,relation.type))))return false
  return plan.nodes.every(node=>skeletonIds.has(node.temporaryId)||plan.relations.some(relation=>(relation.fromTemporaryId===node.temporaryId&&skeletonIds.has(relation.toTemporaryId))||(relation.toTemporaryId===node.temporaryId&&skeletonIds.has(relation.fromTemporaryId))))
}

export class LocalAiService {
  private readonly runtime:DetectedRuntime
  private readonly storage:StorageLike|null
  private readonly adapterFactory?:()=>LocalAiRuntimeAdapter|null
  private adapter:LocalAiRuntimeAdapter|null=null
  private enabled:boolean
  private status:LocalAiStatus
  private listeners=new Set<(status:LocalAiStatus)=>void>()
  private cache=new Map<string,ThoughtInterpretation>()
  private activeDebugModelTraceId:string|null=null

  public constructor(options:ServiceOptions={}){
    this.runtime=options.runtime??detectRuntime()
    this.storage=options.storage===undefined?(typeof localStorage==='undefined'?null:localStorage):options.storage
    this.adapterFactory=options.adapterFactory
    const native=this.runtime.platform!=='web'
    this.enabled=options.enabled??(native||this.storage?.getItem(ENABLED_KEY)==='true')
    const modelId=this.runtime.profile.modelId??this.runtime.profile.nativeModel
    this.status={phase:modelId?'available':'heuristic',tier:this.runtime.profile.tier,modelId,progress:0,message:modelId?`${this.runtime.profile.label} available`:'Fast deterministic language engine',enabled:this.enabled}
  }

  public getCapabilities(){return this.runtime}
  public getStatus():LocalAiStatus{return {...this.status}}
  public subscribe(listener:(status:LocalAiStatus)=>void){this.listeners.add(listener);listener(this.getStatus());return()=>{this.listeners.delete(listener)}}
  private update(patch:Partial<LocalAiStatus>){this.status={...this.status,...patch};for(const listener of this.listeners)listener(this.getStatus())}

  private profile():LocalAiModelProfile|null{
    const selected=this.runtime.profile;const modelId=selected.modelId??selected.nativeModel
    if(!modelId||this.runtime.profile.tier==='heuristic')return null
    const backend=this.runtime.platform==='tauri'?'tauri':this.runtime.platform==='capacitor'?'capacitor':'webllm'
    return{id:selected.tier,backend,modelId,maxOutputTokens:selected.maxOutputTokens,contextWindowTokens:8192,temperature:.08,topP:.85}
  }

  private getAdapter():LocalAiRuntimeAdapter|null{
    if(this.adapter)return this.adapter
    if(this.adapterFactory){this.adapter=this.adapterFactory();return this.adapter}
    const profile=this.profile();if(!profile)return null
    this.adapter=profile.backend==='tauri'?createTauriLocalAiAdapter(profile):profile.backend==='capacitor'?createCapacitorLocalAiAdapter(profile):createWebLlmAdapter(profile,{onInitProgress:p=>this.update({phase:'downloading',progress:p.progress,message:p.message})})
    return this.adapter.isAvailable()?this.adapter:null
  }

  public async enableModel():Promise<void>{
    const adapter=this.getAdapter()
    if(!adapter){this.enabled=false;this.update({phase:'unsupported',enabled:false,message:'Local model unavailable on this device'});return}
    // Do not expose the model to the per-keystroke enrichment effect until its
    // one-time load/warm-up request has completed. Otherwise the first text
    // prediction can supersede setup while WebGPU is still compiling shaders.
    this.enabled=false
    this.update({phase:'downloading',enabled:false,progress:0,message:'Preparing local model'})
    try{
      await adapter.generate({systemPrompt:'/no_think\nReturn JSON only.',prompt:'Return {"ready":true}',responseFormat:'json',jsonSchema:{type:'object',additionalProperties:false,required:['ready'],properties:{ready:{type:'boolean'}}},maxOutputTokens:32,generationTimeoutMs:30_000,stream:false,onInitProgress:p=>this.update({phase:'downloading',progress:p.progress,message:p.message})})
      this.enabled=true
      this.storage?.setItem(ENABLED_KEY,'true')
      this.update({phase:'ready',enabled:true,progress:1,message:`${this.runtime.profile.label} ready`})
    }catch(error){this.enabled=false;this.storage?.setItem(ENABLED_KEY,'false');this.update({phase:'error',enabled:false,message:'Model setup failed; deterministic engine remains active'});throw error}
  }

  public async disableModel():Promise<void>{this.enabled=false;this.storage?.setItem(ENABLED_KEY,'false');await this.adapter?.dispose();if(this.runtime.platform==='web')await disposeCachedWebLlmEngine();this.adapter=null;this.update({phase:this.profile()?'available':'heuristic',enabled:false,progress:0,message:'Fast deterministic language engine'})}

  public async predictThought(sourceText:string,context:InterpretationContext={}):Promise<ThoughtPlan>{return (await this.predictThoughtCandidates(sourceText,context,{allowModel:true})).predictions[0]?.plan??interpretThought(sourceText,context)}

  /** Deliberate full-graph planning for callers that explicitly ask to deepen a workspace. */
  public async predictDeepThoughtCandidates(sourceText:string,context:InterpretationContext={},signal?:AbortSignal,skeleton?:ThoughtPlan):Promise<ThoughtInterpretation>{
    return this.predictThoughtCandidates(sourceText,context,{allowModel:true,mode:'deep',signal,skeleton})
  }

  public async predictThoughtCandidates(sourceText:string,context:InterpretationContext={},options:PredictionOptions={}):Promise<ThoughtInterpretation>{
    if(options.signal?.aborted)throw abortError()
    const debugState=useAiDebugStore.getState()
    const debug=debugState.isOpen?debugState:null
    // Structural detection runs first — before scenario routing and before
    // any model call — so quantified requests are correct on every tier.
    let deterministic=withStructuralPlan(interpretThoughtCandidates(sourceText,context),sourceText)
    if(options.mode==='compose'){
      const scaffolded=withScaffoldPlan(deterministic,sourceText)
      deterministic=scaffolded.interpretation
      if(scaffolded.skeleton&&!options.skeleton)options={...options,skeleton:scaffolded.skeleton}
    }
    if(options.mode==='compose'&&(deterministic.predictions[0]?.confidence??0)>=.92){
      return deterministic
    }
    if(!options.allowModel){
      const deterministicTrace=debug?.beginCall({
        phase:'quickadd-deterministic',label:traceLabel(sourceText),model:'Grovepad deterministic engine',prompt:tracePrompt(sourceText,context),
      })
      if(debug&&deterministicTrace)debug.endCall(deterministicTrace,{status:'ok',response:compactInterpretation(deterministic),summary:`${deterministic.predictions[0]?.label??'No prediction'} · ${deterministic.predictions[0]?.plan.nodes.length??0} nodes`})
      return deterministic
    }
    if(!this.enabled||sourceText.trim().length<4){
      const skippedTrace=debug?.beginCall({
        phase:'quickadd-model',label:traceLabel(sourceText),model:`${this.runtime.profile.label} · ${this.runtime.platform}/${this.runtime.profile.tier}`,prompt:tracePrompt(sourceText,context),
      })
      if(debug&&skippedTrace)debug.endCall(skippedTrace,{
        status:'aborted',
        summary:!this.enabled?'Skipped · model is not enabled':'Skipped · enter at least 4 characters',
      })
      return deterministic
    }
    const mode=options.mode??'fast'
    if((mode==='deep'||mode==='compose')&&!this.runtime.profile.allowDeepPlanning){
      const skippedTrace=debug?.beginCall({phase:'quickadd-model',label:traceLabel(sourceText),model:`${this.runtime.profile.label} · router only`,prompt:tracePrompt(sourceText,context)})
      if(debug&&skippedTrace)debug.endCall(skippedTrace,{status:'aborted',summary:'This device tier uses the model for routing only'})
      return deterministic
    }
    const structuralTop=deterministic.predictions[0]?.id==='structural'?deterministic.predictions[0]:null
    // Structural plans are already correct; routing them is pointless. The
    // model's only remaining job is cosmetic branch naming, which stays
    // gated to tiers trusted with generation beyond routing.
    if(mode==='fast'&&structuralTop&&!this.runtime.profile.allowDeepPlanning){
      const skippedTrace=debug?.beginCall({phase:'quickadd-model',label:traceLabel(sourceText),model:`${this.runtime.profile.label} · router only`,prompt:tracePrompt(sourceText,context)})
      if(debug&&skippedTrace)debug.endCall(skippedTrace,{status:'aborted',summary:'Structure is deterministic; this tier does not rename titles'})
      return deterministic
    }
    // An explicit deepen on a structural request elaborates the fixed
    // skeleton rather than letting the model re-derive the topology.
    if(mode==='deep'&&structuralTop&&!options.skeleton)options={...options,skeleton:structuralTop.plan}
    const task:'router'|'titles'|'deep'=mode==='deep'||mode==='compose'?'deep':structuralTop?'titles':'router'
    // Compose elaborates a scaffold whose branches are already free — grant a
    // little extra headroom so a 5-branch starter can still grow substance.
    const deepExtras=mode==='compose'?Math.min(10,this.runtime.profile.maxDeepExtras+4):this.runtime.profile.maxDeepExtras
    const titleTargets=task==='titles'?structuralTitleTargets(structuralTop!.plan):[]
    const candidates=fastCandidates(deterministic,sourceText)
    const systemPrompt=task==='router'?fastRouterPrompt(candidates):task==='titles'?titleEnrichPrompt(sourceText,titleTargets):buildLocalAiPlanSystemPrompt(options.skeleton,deepExtras)
    const jsonSchema=task==='router'?fastRouterSchema(candidates):task==='titles'?titleEnrichSchema(titleTargets.map(node=>node.temporaryId)):LOCAL_MODEL_PLAN_JSON_SCHEMA
    const modelLabel=`${this.runtime.profile.label} · ${task==='router'?'intent router':task==='titles'?'branch namer':mode==='compose'?'composer':'deep planner'} · ${this.runtime.platform}/${this.runtime.profile.tier}`
    if(debug&&this.activeDebugModelTraceId){
      debug.endCall(this.activeDebugModelTraceId,{status:'aborted',summary:'Superseded by newer Quick Add text'})
    }
    const modelTrace=debug?.beginCall({
      phase:'quickadd-model',label:traceLabel(sourceText),model:modelLabel,
      prompt:`[system]\n${systemPrompt}\n\n${tracePrompt(sourceText,context)}`,
    })??null
    this.activeDebugModelTraceId=modelTrace
    const finishModelTrace=(result:Parameters<ReturnType<typeof useAiDebugStore.getState>['endCall']>[1])=>{
      if(!debug||!modelTrace)return
      debug.endCall(modelTrace,result)
      if(this.activeDebugModelTraceId===modelTrace)this.activeDebugModelTraceId=null
    }
    const key=cacheKey(sourceText,context,mode,options.skeleton);const hit=this.cache.get(key);if(hit){
      this.cache.delete(key);this.cache.set(key,hit);this.update({phase:'ready',progress:1,message:`${this.runtime.profile.label} ready`})
      finishModelTrace({status:'ok',response:compactInterpretation(hit),summary:'Cache hit · validated local model plan'})
      return hit
    }
    const adapter=this.getAdapter();if(!adapter){
      finishModelTrace({status:'error',error:'No local runtime adapter is available',summary:'Model unavailable; deterministic result retained'})
      return deterministic
    }
    this.update({phase:'thinking',message:'Understanding your request locally'})
    try{
      let lastDebugPaint=0
      const onToken=debug&&modelTrace?(_token:string,accumulated:string)=>{
        const now=Date.now()
        if(now-lastDebugPaint<100)return
        lastDebugPaint=now
        debug.updateCall(modelTrace,{response:accumulated,summary:`Streaming response · ${accumulated.length.toLocaleString()} characters`})
      }:undefined
      // Compose is the always-on low-confidence path — it must feel instant,
      // so it hard-stops at 5s and ships the scaffold alone past that.
      // Deep is an explicit "think deeper" request and may take longer.
      const result=await adapter.generate({systemPrompt,prompt:sourceText,context:{...context},responseFormat:'json',jsonSchema,maxOutputTokens:task==='router'?48:task==='titles'?640:mode==='compose'?768:undefined,generationTimeoutMs:task==='router'?3_000:task==='titles'?12_000:mode==='compose'?5_000:20_000,stream:true,signal:options.signal,onToken})
      if(options.signal?.aborted)throw abortError()
      if(task==='titles'){
        const enriched=applyEnrichedTitles(structuralTop!,result.text,new Set(titleTargets.map(node=>node.temporaryId)))
        if(!enriched){
          this.update({phase:'ready',message:'Title response was unsafe; deterministic titles kept'})
          finishModelTrace({status:'ok',response:result.text,summary:'Invalid title response rejected; deterministic structure retained'})
          return deterministic
        }
        const predictions=[enriched,...deterministic.predictions.slice(1)].slice(0,4)
        const interpretation:ThoughtInterpretation={...deterministic,predictions,recommendedId:enriched.id,confidenceMargin:enriched.confidence-(predictions[1]?.confidence??0),shouldAutoCommit:false}
        this.cache.set(key,interpretation);if(this.cache.size>CACHE_LIMIT)this.cache.delete(this.cache.keys().next().value!)
        this.update({phase:'ready',progress:1,message:`${this.runtime.profile.label} ready`})
        finishModelTrace({status:'ok',response:result.text,summary:`Renamed ${enriched.plan.nodes.filter((node,index)=>node.title!==structuralTop!.plan.nodes[index]!.title).length} structural titles · structure untouched`})
        return interpretation
      }
      if(task==='router'){
        const route=parseFastRoute(result.text,candidates,sourceText)
        if(!route){
          this.update({phase:'ready',message:'Router response was unsafe; local plan kept'})
          finishModelTrace({status:'ok',response:result.text,summary:'Invalid router response rejected; deterministic result retained'})
          return deterministic
        }
        const selected=candidates.find(candidate=>candidate.id===route.route)!
        let interpretation:ThoughtInterpretation
        if(selected.kind==='archetype'){
          const inspected=inspectScenarioMatches(sourceText).matches
          const regexWinner=inspected.find(match=>match.consumed>0)
          const agrees=regexWinner?.archetypeId===selected.archetype.id
          const disagreement=Boolean(regexWinner&&regexWinner.archetypeId!==selected.archetype.id&&regexWinner.score-selected.archetype.score>=.14)
          const explicit=(deterministic.predictions[0]?.confidence??0)>=.92
          const threshold=agrees ? .45 : (explicit||disagreement) ? .75 : .55
          const scenarioRoute=route.confidence>=threshold?{
            archetypeId:selected.archetype.id,
            confidence:route.confidence,
            ...(route.topic?{topic:route.topic}:{}),
            ...(route.date?{date:route.date}:{}),
            ...(route.amount?{amount:route.amount}:{}),
          }:undefined
          interpretation={...deterministic,...(scenarioRoute?{scenarioRoute}:{}),shouldAutoCommit:false}
        }else{
          const selectedPrediction=selected.prediction
          const confidence=Math.min(.96,Math.max(selectedPrediction.confidence,route.confidence))
          const explicit=(deterministic.predictions[0]?.confidence??0)>=.92
          const disagrees=deterministic.predictions[0]?.id!==selectedPrediction.id
          const largeMargin=deterministic.confidenceMargin>=.18
          const mayLead=!explicit&&(!disagrees||!largeMargin||route.confidence>=.75)
          const routerPrediction:ThoughtPrediction={
            ...selectedPrediction,
            id:'local-router',
            confidence,
            explanation:`Local ${this.runtime.profile.label} selected this deterministic recipe`,
          }
          const predictions=(mayLead
            ? [routerPrediction,...deterministic.predictions.filter(prediction=>prediction.id!==selectedPrediction.id)]
            : [...deterministic.predictions,routerPrediction]
          ).slice(0,4)
          interpretation={...deterministic,predictions,recommendedId:predictions[0]?.id??null,confidenceMargin:(predictions[0]?.confidence??0)-(predictions[1]?.confidence??0),shouldAutoCommit:false}
        }
        this.cache.set(key,interpretation);if(this.cache.size>CACHE_LIMIT)this.cache.delete(this.cache.keys().next().value!)
        this.update({phase:'ready',progress:1,message:`${this.runtime.profile.label} ready`})
        finishModelTrace({status:'ok',response:result.text,summary:selected.kind==='archetype'
          ? `Handshake → ${selected.archetype.label} scenario · ${interpretation.scenarioRoute?'accepted':'confidence gate kept deterministic result'}`
          : `Handshake → ${selected.prediction.label} · ${selected.prediction.plan.nodes.length} deterministic nodes`})
        return interpretation
      }
      const plan=parseLocalAiPlan(result.text,sourceText)
      if(!plan||(options.skeleton&&!respectsDeepSkeleton(plan,options.skeleton,deepExtras))){
        this.update({phase:'ready',message:'Model response was unsafe; local plan kept'})
        finishModelTrace({status:'ok',response:result.text,summary:options.skeleton&&plan?'Deep plan changed or detached the fixed skeleton; rejected':planSummary(null)})
        return deterministic
      }
      const nodeBonus=plan.nodes.length>=10 ? .12 : plan.nodes.length>=3 ? .07 : 0
      const confidence=Math.min(.96,Math.max(plan.confidence,.79)+nodeBonus)
      plan.confidence=confidence;plan.nodes.forEach(node=>{node.confidence=Math.max(node.confidence,confidence-.06)})
      const primaryTypes=plan.nodes.map(node=>node.widgetType)
      const modelPrediction:ThoughtPrediction={id:'local-model',label:plan.nodes.length===1?widgetDefinition(primaryTypes[0]!).label:`Build ${plan.nodes.length}-card workspace`,explanation:`Local ${this.runtime.profile.label} composed and validated a connected workspace`,confidence,plan,primaryTypes,kind:plan.nodes.length===1?'single':'combined'}
      const explicit=deterministic.predictions[0]?.confidence??0
      const predictions=(explicit>=.92&&plan.nodes.length===1?[...deterministic.predictions,modelPrediction]:[modelPrediction,...deterministic.predictions]).filter((prediction,index,array)=>array.findIndex(item=>item.id===prediction.id)===index).slice(0,4)
      const interpretation:ThoughtInterpretation={...deterministic,predictions,recommendedId:predictions[0]?.id??null,confidenceMargin:predictions[0]?(predictions[0].confidence-(predictions[1]?.confidence??0)):0,shouldAutoCommit:false}
      this.cache.set(key,interpretation);if(this.cache.size>CACHE_LIMIT)this.cache.delete(this.cache.keys().next().value!)
      this.update({phase:'ready',progress:1,message:`${this.runtime.profile.label} ready`})
      finishModelTrace({status:'ok',response:result.text,summary:planSummary(plan)})
      return interpretation
    }catch(error){
      if(isAbortError(error)||options.signal?.aborted){finishModelTrace({status:'aborted',summary:'Superseded by newer input'});throw abortError()}
      // A generation timeout is the compose budget working as designed, not a
      // broken runtime — keep the model enabled and ship the scaffold.
      if(error instanceof Error&&error.name==='TimeoutError'){
        this.update({phase:'ready',message:'Model ran out of time; instant plan kept'})
        finishModelTrace({status:'error',error:error.message,summary:'Generation hit its time budget; deterministic result retained'})
        return deterministic
      }
      // A broken GPU/native session should not be retried on every keystroke.
      // Keep Quick Add instant and let the user explicitly retry model setup.
      this.enabled=false
      this.storage?.setItem(ENABLED_KEY,'false')
      this.update({phase:'error',enabled:false,message:'Model unavailable; using deterministic interpretation'})
      finishModelTrace({status:'error',error:error instanceof Error?error.message:String(error),summary:'Model failed; deterministic result retained'})
      return deterministic
    }
  }

  public recordChoice(sourceText:string,prediction:ThoughtPrediction):void{recordInterpretationChoice(sourceText,prediction)}
}

export const localAiService=new LocalAiService()
