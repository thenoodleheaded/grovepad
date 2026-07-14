import { describe,expect,it } from 'vitest'
import { LocalAiService } from './localAiService'
import { MODEL_PROFILES } from './local-ai/modelProfiles'
import type { LocalAiRuntimeAdapter } from './local-ai'
import { useWidgetStore } from '../store/useWidgetStore'

function fakeAdapter(text:string):LocalAiRuntimeAdapter{return{
  backend:'webllm',profile:{id:'test',backend:'webllm',modelId:'test-model',maxOutputTokens:8192},isAvailable:()=>true,
  generate:async()=>({text,backend:'webllm',modelId:'test-model',durationMs:1}),dispose:async()=>{},
}}
const runtime={profile:MODEL_PROFILES['webgpu-balanced'],isMobile:false,hasWebGPU:true,memoryGb:8,platform:'web' as const}

describe('LocalAiService hybrid planning',()=>{
  it('does not start text enrichment until model warm-up is complete',async()=>{
    let finishWarmup:((value:{text:string;backend:'webllm';modelId:string;durationMs:number})=>void)|undefined
    let calls=0
    const adapter:LocalAiRuntimeAdapter={
      backend:'webllm',
      profile:{id:'test',backend:'webllm',modelId:'test-model',maxOutputTokens:8192},
      isAvailable:()=>true,
      generate:()=>{
        calls+=1
        return new Promise(resolve=>{finishWarmup=resolve})
      },
      dispose:async()=>{},
    }
    const service=new LocalAiService({runtime,storage:null,enabled:false,adapterFactory:()=>adapter})
    const warmup=service.enableModel()
    expect(service.getStatus()).toMatchObject({phase:'downloading',enabled:false})
    await service.predictThoughtCandidates('make a checklist',{}, {allowModel:true})
    expect(calls).toBe(1)
    finishWarmup?.({text:'{"ready":true}',backend:'webllm',modelId:'test-model',durationMs:1})
    await warmup
    expect(service.getStatus()).toMatchObject({phase:'ready',enabled:true})
  })

  it('keeps the deterministic engine instant when model use is disabled',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:false,adapterFactory:()=>fakeAdapter('')})
    const result=await service.predictThoughtCandidates('make a checklist',{}, {allowModel:false})
    expect(result.predictions[0]?.primaryTypes[0]).toBe('checklist')
  })

  it('accepts and ranks a validated 40-node connected workspace',async()=>{
    const nodes=Array.from({length:40},(_,index)=>({id:`n${index}`,t:index%3===0?'checklist':'notes',title:`Branch ${index}`}))
    const relations=nodes.slice(1).map((_,index)=>({from:`n${Math.floor(index/3)}`,to:`n${index+1}`,type:'parent'}))
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter(JSON.stringify({v:1,c:.9,n:nodes,r:relations}))})
    const result=await service.predictThoughtCandidates('Create a full launch workspace with forty properly branched work areas',{}, {allowModel:true,mode:'deep'})
    expect(result.predictions[0]?.id).toBe('local-model')
    expect(result.predictions[0]?.plan.nodes).toHaveLength(40)
    expect(result.predictions[0]?.plan.relations).toHaveLength(39)
    expect(result.predictions[0]?.plan.nodes.some(node=>node.depth>=3)).toBe(true)
  })

  it('commits a 40-node model plan as one connected, collision-free canvas graph',async()=>{
    const nodes=Array.from({length:40},(_,index)=>({id:`n${index}`,t:index%4===0?'checklist':'notes',title:`Workstream ${index}`}))
    const relations=nodes.slice(1).map((_,index)=>({from:`n${Math.floor(index/3)}`,to:`n${index+1}`,type:'parent'}))
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter(JSON.stringify({v:1,c:.91,n:nodes,r:relations}))})
    const result=await service.predictThoughtCandidates('Build a detailed forty-part launch plan with branches and sub-branches',{}, {allowModel:true,mode:'deep'})
    const plan=result.predictions[0]!.plan
    const before=useWidgetStore.getState()
    const beforeWidgetIds=new Set(Object.keys(before.widgets))
    const beforeRelationIds=new Set(Object.keys(before.relations))
    let storeNotifications=0
    const unsubscribe=useWidgetStore.subscribe(()=>{storeNotifications+=1})

    try {
      const created=useWidgetStore.getState().commitThoughtPlan(plan,{x:12000,y:12000})
      const after=useWidgetStore.getState()
      const createdSet=new Set(created)
      const createdRelations=Object.entries(after.relations)
        .filter(([id,relation])=>!beforeRelationIds.has(id)&&createdSet.has(relation.fromId)&&createdSet.has(relation.toId))
        .map(([,relation])=>relation)

      expect(created).toHaveLength(40)
      expect(Object.keys(after.widgets).filter(id=>!beforeWidgetIds.has(id))).toHaveLength(40)
      expect(createdRelations).toHaveLength(39)
      expect(after.widgetStructureVersion).toBe(before.widgetStructureVersion+1)
      expect(storeNotifications).toBeLessThanOrEqual(2)

      const adjacent=new Map(created.map(id=>[id,[] as string[]]))
      createdRelations.forEach(relation=>{
        adjacent.get(relation.fromId)!.push(relation.toId)
        adjacent.get(relation.toId)!.push(relation.fromId)
      })
      const visited=new Set<string>([created[0]!])
      const queue=[created[0]!]
      while(queue.length){
        const id=queue.shift()!
        for(const next of adjacent.get(id)??[]){if(!visited.has(next)){visited.add(next);queue.push(next)}}
      }
      expect(visited.size).toBe(40)

      for(let leftIndex=0;leftIndex<created.length;leftIndex++){
        const left=after.widgets[created[leftIndex]!]!
        expect(Number.isFinite(left.position.x)&&Number.isFinite(left.position.y)).toBe(true)
        for(let rightIndex=leftIndex+1;rightIndex<created.length;rightIndex++){
          const right=after.widgets[created[rightIndex]!]!
          const overlaps=left.position.x<right.position.x+right.size.width&&left.position.x+left.size.width>right.position.x&&left.position.y<right.position.y+right.size.height&&left.position.y+left.size.height>right.position.y
          expect(overlaps,`${left.title} overlaps ${right.title}`).toBe(false)
        }
      }
    } finally {
      unsubscribe()
      useWidgetStore.getState().undo()
    }
  })

  it('falls back safely when a model invents widget types',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"v":1,"c":.9,"n":[{"id":"x","t":"magic_widget"}],"r":[]}')})
    const result=await service.predictThoughtCandidates('make me something useful',{}, {allowModel:true,mode:'deep'})
    expect(result.predictions.some(prediction=>prediction.id==='local-model')).toBe(false)
  })

  it('keeps an explicit deterministic command first even when the router agrees',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"id":"r0","c":0.92}')})
    const result=await service.predictThoughtCandidates('make a checklist',{}, {allowModel:true,mode:'fast'})
    expect(result.predictions[0]).toMatchObject({id:'single-checklist',primaryTypes:['checklist']})
    expect(result.predictions[0]?.plan.nodes).toHaveLength(1)
  })

  it('lets the tiny model surface a curated archetype that regex routing missed',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"route":"a:language-learning","topic":"Spanish","c":0.81}')})
    const result=await service.predictThoughtCandidates('Spanish has gotten rusty',{}, {allowModel:true,mode:'fast'})
    expect(result.scenarioRoute).toMatchObject({archetypeId:'language-learning',topic:'Spanish',confidence:.81})
    expect(result.predictions.some(prediction=>prediction.id==='local-model')).toBe(false)
  })

  it('rejects model-invented slots during the handshake',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"route":"a:language-learning","topic":"French","date":"tomorrow","amount":"$900","c":0.84}')})
    const result=await service.predictThoughtCandidates('Spanish has gotten rusty',{}, {allowModel:true,mode:'fast'})
    expect(result.scenarioRoute).toMatchObject({archetypeId:'language-learning'})
    expect(result.scenarioRoute).not.toHaveProperty('topic')
    expect(result.scenarioRoute).not.toHaveProperty('date')
    expect(result.scenarioRoute).not.toHaveProperty('amount')
  })

  it('marks the lightest web model as router-only',async()=>{
    const lightRuntime={...runtime,profile:MODEL_PROFILES['webgpu-light'],memoryGb:4}
    const service=new LocalAiService({runtime:lightRuntime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"v":1,"c":.9,"n":[{"id":"n0","t":"notes"}],"r":[]}')})
    const result=await service.predictThoughtCandidates('deeply expand this plan',{}, {allowModel:true,mode:'deep'})
    expect(result.predictions.some(prediction=>prediction.id==='local-model')).toBe(false)
  })

  it('rejects an explicit deep plan that replaces its deterministic skeleton',async()=>{
    const skeleton=(await new LocalAiService({runtime,storage:null,enabled:false}).predictThoughtCandidates('make a checklist',{}, {allowModel:false})).predictions[0]!.plan
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter('{"v":1,"c":.9,"n":[{"id":"replacement","t":"notes"}],"r":[]}')})
    const result=await service.predictThoughtCandidates('deepen this checklist',{}, {allowModel:true,mode:'deep',skeleton})
    expect(result.predictions.some(prediction=>prediction.id==='local-model')).toBe(false)
  })

  it('accepts a deep plan with a valid group and drops groups pointing at missing nodes',async()=>{
    const payload=JSON.stringify({v:1,c:.9,
      n:[{id:'n0',t:'notes',title:'Root'},{id:'n1',t:'sketchpad',title:'Board'},{id:'n2',t:'flashcards',title:'Drills'}],
      r:[{from:'n0',to:'n1',type:'parent'},{from:'n0',to:'n2',type:'parent'}],
      g:[{id:'g0',members:['n1','n2'],label:'Study pair'},{id:'g1',members:['n2','ghost']}]})
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter(payload)})
    const result=await service.predictThoughtCandidates('a study root with a grouped board and drills',{}, {allowModel:true,mode:'deep'})
    expect(result.predictions[0]?.id).toBe('local-model')
    expect(result.predictions[0]?.plan.groups).toEqual([
      {temporaryId:'g0',memberTemporaryIds:['n1','n2'],label:'Study pair'},
    ])
  })

  it('builds quantified structural requests deterministically with AI fully disabled',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:false})
    const result=await service.predictThoughtCandidates(
      'make me a calculus 2 course topic tree, 3 main topics, 5 subtopics each. attach appropriate widgets for me to study, also attach a sketchpad in a group to every subtopic node',
      {},{allowModel:false})
    const top=result.predictions[0]!
    expect(top.id).toBe('structural')
    expect(result.recommendedId).toBe('structural')
    expect(top.plan.nodes.filter(node=>/^Topic \d+$/.test(node.title))).toHaveLength(3)
    expect(top.plan.nodes.filter(node=>node.widgetType==='sketchpad')).toHaveLength(12)
    expect(top.plan.groups).toHaveLength(12)
    expect(top.plan.warnings.some(warning=>warning.message.includes('Reduced to 4 subtopics'))).toBe(true)
  })

  it('uses the model only to rename structural titles, never to edit structure',async()=>{
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter(
      '{"titles":[{"id":"s-1","title":"Integration Techniques"},{"id":"ghost","title":"Injected"},{"id":"s-root","title":"Calculus 2 Mastery"}]}',
    )})
    const request='a calculus course tree, 2 topics, 2 subtopics each. attach a sketchpad in a group to every subtopic'
    const deterministic=await service.predictThoughtCandidates(request,{}, {allowModel:false})
    const enriched=await service.predictThoughtCandidates(request,{}, {allowModel:true,mode:'fast'})
    const before=deterministic.predictions[0]!.plan
    const after=enriched.predictions[0]!.plan
    expect(enriched.predictions[0]!.id).toBe('structural')
    expect(after.nodes.find(node=>node.temporaryId==='s-1')?.title).toBe('Integration Techniques')
    expect(after.nodes.find(node=>node.temporaryId==='s-root')?.title).toBe('Calculus 2 Mastery')
    expect(after.nodes.map(node=>node.temporaryId)).toEqual(before.nodes.map(node=>node.temporaryId))
    expect(after.relations).toEqual(before.relations)
    expect(after.groups.map(group=>group.memberTemporaryIds)).toEqual(before.groups.map(group=>group.memberTemporaryIds))
    expect(after.nodes.some(node=>node.title==='Injected')).toBe(false)
  })

  it('skips title enrichment on the router-only tier while keeping the structural plan',async()=>{
    const lightRuntime={...runtime,profile:MODEL_PROFILES['webgpu-light'],memoryGb:4}
    let generateCalls=0
    const adapter:LocalAiRuntimeAdapter={...fakeAdapter('{"titles":[]}'),generate:async()=>{generateCalls+=1;return{text:'{"titles":[]}',backend:'webllm',modelId:'test-model',durationMs:1}}}
    const service=new LocalAiService({runtime:lightRuntime,storage:null,enabled:true,adapterFactory:()=>adapter})
    const result=await service.predictThoughtCandidates('a biology course tree, 2 topics, 2 subtopics each',{}, {allowModel:true,mode:'fast'})
    expect(result.predictions[0]?.id).toBe('structural')
    expect(generateCalls).toBe(0)
  })

  it('commits plan groups as real widget groups in one undo step',async()=>{
    const payload=JSON.stringify({v:1,c:.9,
      n:[{id:'n0',t:'notes',title:'Root'},{id:'n1',t:'sketchpad',title:'Board'},{id:'n2',t:'flashcards',title:'Drills'}],
      r:[{from:'n0',to:'n1',type:'parent'},{from:'n0',to:'n2',type:'parent'}],
      g:[{id:'g0',members:['n1','n2'],label:'Study pair'}]})
    const service=new LocalAiService({runtime,storage:null,enabled:true,adapterFactory:()=>fakeAdapter(payload)})
    const result=await service.predictThoughtCandidates('a study root with a grouped board and drills',{}, {allowModel:true,mode:'deep'})
    const plan=result.predictions[0]!.plan
    const beforeGroupIds=new Set(Object.keys(useWidgetStore.getState().groups))
    try{
      const created=useWidgetStore.getState().commitThoughtPlan(plan,{x:20000,y:20000})
      const after=useWidgetStore.getState()
      const newGroups=Object.values(after.groups).filter(group=>!beforeGroupIds.has(group.id))
      expect(newGroups).toHaveLength(1)
      expect(newGroups[0]?.label).toBe('Study pair')
      expect(newGroups[0]?.widgetIds).toHaveLength(2)
      for(const widgetId of newGroups[0]!.widgetIds){
        expect(created).toContain(widgetId)
        expect(after.widgetGroupIndex[widgetId]).toBe(newGroups[0]!.id)
      }
    }finally{
      useWidgetStore.getState().undo()
    }
    expect(Object.keys(useWidgetStore.getState().groups)).toEqual([...beforeGroupIds])
  })
})
