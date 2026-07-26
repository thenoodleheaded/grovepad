import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useState, type CSSProperties, type FormEvent } from 'react'
import type { LinkedListData, LinkedListNode } from '../../../types/spatial'
import {
  MAX_LINKED_LIST_NODES,
  appendLinkedNode,
  circularLinkedWindow,
  linkedListNodes,
  linkedListSkinMode,
  linkedNodeIndex,
  linkedPointerRows,
  moveLinkedNode,
  neighboringNodeId,
  removeLinkedNode,
  reverseLinkedNodes,
  selectedLinkedNodeId,
  updateLinkedNode,
  type LinkedListSkinMode,
} from './linkedListSkinModel'

interface LinkedListWidgetProps {
  data: LinkedListData
  onChange: (data: LinkedListData) => void
  skin?: LinkedListSkinMode
}

interface ViewProps {
  nodes: LinkedListNode[]
  selectedId: string | null
  select: (id: string) => void
  update: (id: string, value: string) => void
  remove: (id: string) => void
  move: (id: string, direction: -1 | 1) => void
}

function NodeValue({
  node,
  index,
  select,
  update,
  className = '',
}: {
  node: LinkedListNode
  index: number
  select: (id: string) => void
  update: (id: string, value: string) => void
  className?: string
}) {
  return (
    <div className={`gp-linked-value gp-bare-field ${className}`}>
      <input
        value={node.value}
        aria-label={`Node ${index + 1} value`}
        placeholder="Node value"
        onFocus={() => select(node.id)}
        onChange={(event) => update(node.id, event.target.value)}
      />
    </div>
  )
}

function EmptyList() {
  return (
    <div className="gp-linked-empty">
      <span aria-hidden>∅</span>
      <strong>No head yet</strong>
      <p>Add a node below to start the chain.</p>
    </div>
  )
}

function NodeTools({
  node,
  index,
  length,
  move,
  remove,
}: {
  node: LinkedListNode
  index: number
  length: number
  move: ViewProps['move']
  remove: ViewProps['remove']
}) {
  return (
    <span className="gp-linked-node-tools">
      <button
        type="button"
        aria-label={`Move node ${index + 1} toward head`}
        disabled={index === 0}
        onClick={() => move(node.id, -1)}
      >
        <ArrowUp size={11} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Move node ${index + 1} toward tail`}
        disabled={index === length - 1}
        onClick={() => move(node.id, 1)}
      >
        <ArrowDown size={11} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Remove node ${index + 1}`}
        onClick={() => remove(node.id)}
      >
        <Trash2 size={11} aria-hidden />
      </button>
    </span>
  )
}

function ChainSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove } = props
  if (nodes.length === 0) return <EmptyList />
  return (
    <div className="gp-linked-chain-scroll">
      <div className="gp-linked-chain" role="list" aria-label="Head to tail chain">
        {nodes.map((node, index) => (
          <div className="gp-linked-chain-step" key={node.id}>
            <div
              className="gp-linked-chain-node"
              data-selected={selectedId === node.id || undefined}
              data-head={index === 0 || undefined}
              data-tail={index === nodes.length - 1 || undefined}
              role="listitem"
            >
              <span className="gp-linked-cap">
                {index === 0 ? 'Head' : index === nodes.length - 1 ? 'Tail' : `#${index + 1}`}
              </span>
              <NodeValue node={node} index={index} select={select} update={update} />
              <button
                type="button"
                className="gp-linked-remove"
                aria-label={`Remove node ${index + 1}`}
                onClick={() => remove(node.id)}
              >
                <Trash2 size={11} aria-hidden />
              </button>
            </div>
            {index < nodes.length - 1 && (
              <span className="gp-linked-pointer" aria-hidden>
                <i />
                <ArrowRight size={13} />
              </span>
            )}
          </div>
        ))}
        <span className="gp-linked-null" aria-label="Tail points to null">NULL</span>
      </div>
    </div>
  )
}

function VerticalSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove, move } = props
  if (nodes.length === 0) return <EmptyList />
  return (
    <div className="gp-linked-vertical" role="list" aria-label="Vertical linked list">
      {nodes.map((node, index) => (
        <div className="gp-linked-vertical-step" key={node.id}>
          <div
            className="gp-linked-vertical-node"
            data-selected={selectedId === node.id || undefined}
            role="listitem"
          >
            <span className="gp-linked-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="gp-linked-rail-mark" aria-hidden />
            <NodeValue node={node} index={index} select={select} update={update} />
            <NodeTools node={node} index={index} length={nodes.length} move={move} remove={remove} />
          </div>
          {index < nodes.length - 1 && <span className="gp-linked-rail" aria-hidden />}
        </div>
      ))}
      <span className="gp-linked-vertical-null">NULL</span>
    </div>
  )
}

function CompactSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove } = props
  if (nodes.length === 0) return <EmptyList />
  return (
    <div className="gp-linked-ledger" role="table" aria-label="Compact linked list index">
      <div className="gp-linked-ledger-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">Next</span>
        <span aria-hidden />
      </div>
      {nodes.map((node, index) => (
        <div
          className="gp-linked-ledger-row"
          data-selected={selectedId === node.id || undefined}
          role="row"
          key={node.id}
        >
          <span role="cell">{index === 0 ? 'H' : index === nodes.length - 1 ? 'T' : index + 1}</span>
          <span role="cell">
            <NodeValue node={node} index={index} select={select} update={update} />
          </span>
          <code role="cell">{nodes[index + 1] ? `#${index + 2}` : 'NULL'}</code>
          <button
            type="button"
            aria-label={`Remove node ${index + 1}`}
            onClick={() => remove(node.id)}
          >
            <Trash2 size={11} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

function FocusSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove } = props
  if (nodes.length === 0) return <EmptyList />
  const index = linkedNodeIndex(nodes, selectedId)
  const current = nodes[index]!
  const previous = nodes[index - 1]
  const next = nodes[index + 1]
  return (
    <div className="gp-linked-focus">
      <div className="gp-linked-focus-neighbors" aria-hidden>
        <span>{previous?.value || 'HEAD'}</span>
        <i />
        <span>{next?.value || 'NULL'}</span>
      </div>
      <div className="gp-linked-focus-stage">
        <button
          type="button"
          aria-label="Previous node"
          disabled={!previous}
          onClick={() => previous && select(previous.id)}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="gp-linked-focus-node">
          <span>{index === 0 ? 'Head' : index === nodes.length - 1 ? 'Tail' : `Node ${index + 1}`}</span>
          <NodeValue node={current} index={index} select={select} update={update} />
          <code>{index + 1} / {nodes.length}</code>
        </div>
        <button
          type="button"
          aria-label="Next node"
          disabled={!next}
          onClick={() => next && select(next.id)}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div className="gp-linked-focus-progress" aria-hidden>
        <i style={{ width: `${((index + 1) / nodes.length) * 100}%` }} />
      </div>
      <button
        type="button"
        className="gp-linked-focus-delete"
        onClick={() => remove(current.id)}
      >
        <Trash2 size={11} aria-hidden />
        Remove current
      </button>
    </div>
  )
}

function DoublyLinkedSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove } = props
  if (nodes.length === 0) return <EmptyList />
  return (
    <div className="gp-linked-double-scroll">
      <div className="gp-linked-double" role="list" aria-label="Doubly linked list">
        <span className="gp-linked-null">NULL</span>
        {nodes.map((node, index) => (
          <div className="gp-linked-double-step" key={node.id}>
            {index > 0 && (
              <span className="gp-linked-double-pointer" aria-hidden>
                <ArrowLeftRight size={14} />
              </span>
            )}
            <div
              className="gp-linked-double-node"
              data-selected={selectedId === node.id || undefined}
              role="listitem"
            >
              <div className="gp-linked-double-caps">
                <code>{index ? `#${index}` : 'NULL'}</code>
                <span>{index === 0 ? 'Head' : index === nodes.length - 1 ? 'Tail' : `#${index + 1}`}</span>
                <code>{index < nodes.length - 1 ? `#${index + 2}` : 'NULL'}</code>
              </div>
              <NodeValue node={node} index={index} select={select} update={update} />
              <button type="button" aria-label={`Remove node ${index + 1}`} onClick={() => remove(node.id)}>
                <Trash2 size={11} aria-hidden />
              </button>
            </div>
          </div>
        ))}
        <span className="gp-linked-null">NULL</span>
      </div>
    </div>
  )
}

function CircularSkin(props: ViewProps) {
  const { nodes, selectedId, select, update } = props
  if (nodes.length === 0) return <EmptyList />
  const selected = selectedLinkedNodeId(nodes, selectedId)!
  const currentIndex = linkedNodeIndex(nodes, selected)
  const current = nodes[currentIndex]!
  const window = circularLinkedWindow(nodes, selected)
  return (
    <div className="gp-linked-circle">
      <div className="gp-linked-circle-ring" aria-label="Circular linked list">
        <span className="gp-linked-circle-line" aria-hidden />
        {window.nodes.map((node, index) => (
          <button
            type="button"
            key={node.id}
            aria-label={`Select node ${nodes.findIndex((candidate) => candidate.id === node.id) + 1}: ${node.value}`}
            aria-pressed={node.id === selected}
            className="gp-linked-circle-node"
            style={{
              '--gp-linked-angle': `${(index / window.nodes.length) * 360 - 90}deg`,
              '--gp-linked-angle-inverse': `${90 - (index / window.nodes.length) * 360}deg`,
            } as CSSProperties}
            onClick={() => select(node.id)}
          >
            {node.value || 'Empty'}
          </button>
        ))}
        <div className="gp-linked-circle-core">
          <span>{currentIndex + 1} / {nodes.length}</span>
          <NodeValue node={current} index={currentIndex} select={select} update={update} />
          {window.overflow > 0 && <small>+{window.overflow} around ring</small>}
        </div>
      </div>
      <div className="gp-linked-circle-nav">
        <button
          type="button"
          aria-label="Previous circular node"
          onClick={() => {
            const id = neighboringNodeId(nodes, selected, -1, true)
            if (id) select(id)
          }}
        >
          <ArrowLeft size={13} aria-hidden />
          Previous
        </button>
        <span>Tail → Head</span>
        <button
          type="button"
          aria-label="Next circular node"
          onClick={() => {
            const id = neighboringNodeId(nodes, selected, 1, true)
            if (id) select(id)
          }}
        >
          Next
          <ArrowRight size={13} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function MemoryMapSkin(props: ViewProps) {
  const { nodes, selectedId, select, update, remove } = props
  if (nodes.length === 0) return <EmptyList />
  const rows = linkedPointerRows(nodes)
  const address = new Map(rows.map((row) => [row.id, row.address]))
  return (
    <div className="gp-linked-memory" role="table" aria-label="Linked list memory map">
      <div className="gp-linked-memory-head" role="row">
        <span role="columnheader">Address</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">Next</span>
      </div>
      {rows.map((row) => (
        <div
          className="gp-linked-memory-row"
          data-selected={row.id === selectedId || undefined}
          role="row"
          key={row.id}
        >
          <code role="cell">{row.address}</code>
          <span role="cell">
            <NodeValue
              node={{ id: row.id, value: row.value }}
              index={row.index}
              select={select}
              update={update}
            />
          </span>
          <code role="cell">{row.next ? address.get(row.next) : 'NULL'}</code>
          <button type="button" aria-label={`Remove node ${row.index + 1}`} onClick={() => remove(row.id)}>
            <Trash2 size={11} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

export function LinkedListWidget({
  data,
  onChange,
  skin: rawSkin,
}: LinkedListWidgetProps) {
  const skin = linkedListSkinMode(rawSkin ?? data.skin)
  const nodes = linkedListNodes(data.nodes)
  const selectedId = selectedLinkedNodeId(nodes, data.selectedId)
  const [draft, setDraft] = useState('')

  const commit = (nextNodes: LinkedListNode[], nextSelectedId = selectedId) => {
    onChange({ ...data, nodes: nextNodes, selectedId: nextSelectedId, skin })
  }
  const select = (id: string) => commit(nodes, id)
  const update = (id: string, value: string) => commit(updateLinkedNode(nodes, id, value), id)
  const remove = (id: string) => {
    const next = removeLinkedNode(nodes, id)
    commit(next.nodes, next.selectedId)
  }
  const move = (id: string, direction: -1 | 1) =>
    commit(moveLinkedNode(nodes, id, direction), id)
  const reverse = () => commit(reverseLinkedNodes(nodes), selectedId)

  const add = (event: FormEvent) => {
    event.preventDefault()
    const next = appendLinkedNode(nodes, draft)
    commit(next.nodes, next.selectedId)
    if (next.nodes.length > nodes.length) setDraft('')
  }

  const viewProps: ViewProps = { nodes, selectedId, select, update, remove, move }

  return (
    <div className="gp-linked" data-linked-skin={skin}>
      <div className="gp-linked-toolbar">
        <p>
          <strong>{nodes.length}</strong>
          {nodes.length === 1 ? ' node' : ' nodes'}
        </p>
        <span aria-hidden>
          {nodes.length ? 'HEAD' : '∅'}
          <ArrowRight size={10} />
          {nodes.length > 1 ? 'TAIL' : nodes.length ? 'NULL' : '∅'}
        </span>
        <button type="button" onClick={reverse} disabled={nodes.length < 2}>
          <RotateCcw size={12} aria-hidden />
          Reverse
        </button>
      </div>

      <div className="gp-linked-stage">
        {skin === 'vertical' && <VerticalSkin {...viewProps} />}
        {skin === 'compact' && <CompactSkin {...viewProps} />}
        {skin === 'focus' && <FocusSkin {...viewProps} />}
        {skin === 'doubly_linked' && <DoublyLinkedSkin {...viewProps} />}
        {skin === 'circular' && <CircularSkin {...viewProps} />}
        {skin === 'memory_map' && <MemoryMapSkin {...viewProps} />}
        {skin === 'chain' && <ChainSkin {...viewProps} />}
      </div>

      <form className="gp-linked-add gp-bare-field" onSubmit={add}>
        <Plus size={13} aria-hidden />
        <input
          value={draft}
          aria-label="New node value"
          placeholder={nodes.length ? 'Append after tail…' : 'Create the head…'}
          disabled={nodes.length >= MAX_LINKED_LIST_NODES}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          disabled={nodes.length >= MAX_LINKED_LIST_NODES}
          aria-label="Append node"
        >
          Add
        </button>
      </form>
    </div>
  )
}
