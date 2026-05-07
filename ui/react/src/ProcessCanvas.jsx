import React, { useState, useRef, useEffect, useCallback } from 'react'

const T = {
  textPrimary: '#f0f4f8', textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)', accent: '#818cf8',
  accentBg: 'rgba(99,102,241,0.55)', accentBorder: 'rgba(99,102,241,0.45)',
  glassBg: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.12)',
  shadow: '0 8px 32px rgba(0,0,0,0.35)',
}
function CollapsiblePanel({ title, color, children, defaultOpen = true, extra }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div style={{
      background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${T.glassBorder}`, borderRadius: '10px', boxShadow: T.shadow, overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        padding: '.4rem .55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '.7rem', color: color || T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
          {extra}
          <span style={{ fontSize: '.55rem', color: T.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </div>
      {open && <div style={{ padding: '0 .55rem .4rem' }}>{children}</div>}
    </div>
  )
}

const inputMini = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '3px', color: '#f0f4f8', padding: '2px 4px', fontSize: '.6rem', outline: 'none' }
const CAT_COLORS = { flow: '#60a5fa', routing: '#f59e0b', resources: '#a78bfa', monitoring: '#34d399', connectors: '#f472b6' }
const FABRIC_CATS = ['data', 'decisions', 'queries', 'state']
const FABRIC_COLORS = { data: '#60a5fa', decisions: '#f59e0b', queries: '#a78bfa', state: '#34d399' }

const ELEMENTS = {
  flow: [
    { id: 'source', name: 'Source', icon: '▶', config: { inter_arrival: 5, distribution: 'exponential', entity_type: 'item', max_entities: 100 }, ports_in: [], ports_out: ['out'] },
    { id: 'sink', name: 'Sink', icon: '■', config: {}, ports_in: ['in'], ports_out: [] },
    { id: 'queue', name: 'Queue', icon: '≡', config: { capacity: 0, discipline: 'FIFO' }, ports_in: ['in'], ports_out: ['out'] },
    { id: 'server', name: 'Server', icon: '⚙', config: { service_time: 3, distribution: 'exponential', num_servers: 1 }, ports_in: ['in'], ports_out: ['out'] },
    { id: 'delay', name: 'Delay', icon: '⏳', config: { delay_time: 2, distribution: 'fixed' }, ports_in: ['in'], ports_out: ['out'] },
  ],
  routing: [
    { id: 'branch', name: 'Branch', icon: '⑂', config: { probability: 0.5 }, ports_in: ['in'], ports_out: ['out_a', 'out_b'] },
    { id: 'merge', name: 'Merge', icon: '⊤', config: {}, ports_in: ['in_a', 'in_b'], ports_out: ['out'] },
    { id: 'batch', name: 'Batch', icon: '⊞', config: { batch_size: 5 }, ports_in: ['in'], ports_out: ['out'] },
    { id: 'unbatch', name: 'Unbatch', icon: '⊟', config: {}, ports_in: ['in'], ports_out: ['out'] },
  ],
  resources: [
    { id: 'resource', name: 'Resource', icon: '👤', config: { capacity: 1, name: 'worker' }, ports_in: ['request'], ports_out: ['release'] },
    { id: 'store', name: 'Store', icon: '📦', config: { capacity: 10 }, ports_in: ['put'], ports_out: ['get'] },
    { id: 'counter', name: 'Counter', icon: '⊕', config: { name: 'counter' }, ports_in: ['in'], ports_out: ['out'] },
  ],
  monitoring: [
    { id: 'monitor', name: 'Monitor', icon: '📊', config: { metric: 'wait_time' }, ports_in: ['in'], ports_out: ['out'] },
    { id: 'logger', name: 'Logger', icon: '📝', config: {}, ports_in: ['in'], ports_out: ['out'] },
  ],
  connectors: [
    { id: 'data_in', name: 'Data In', icon: '⇥', config: { category: 'data', name: '', description: 'Live data entry point' }, ports_in: [], ports_out: ['out'] },
    { id: 'data_out', name: 'Data Out', icon: '⇤', config: { category: 'data', name: '', description: 'Data/KPI output point' }, ports_in: ['in'], ports_out: [] },
  ],
}

const VIZ_KPI_TOOLS = {
  charts: [
    { id: 'viz_throughput', name: 'Throughput', icon: '📈', category: 'charts',
      description: 'Entities completed over time',
      config: { window: 10 }, ports_in: ['in'], ports_out: ['out'] },
    { id: 'viz_wait_time', name: 'Wait Time', icon: '⏱', category: 'charts',
      description: 'Queue wait time distribution',
      config: {}, ports_in: ['in'], ports_out: ['out'] },
    { id: 'viz_utilization', name: 'Utilization', icon: '⊙', category: 'charts',
      description: 'Server/resource utilization gauge',
      config: {}, ports_in: ['in'], ports_out: ['out'] },
    { id: 'viz_queue_length', name: 'Queue Length', icon: '≡', category: 'charts',
      description: 'Queue size over time',
      config: {}, ports_in: ['in'], ports_out: ['out'] },
  ],
  kpis: [
    { id: 'kpi_cycle_time', name: 'Cycle Time', icon: '⟳', category: 'kpis',
      description: 'Average time from start to end',
      config: {}, ports_in: ['in'], ports_out: [] },
    { id: 'kpi_wip', name: 'WIP Count', icon: '⊞', category: 'kpis',
      description: 'Work-in-progress count',
      config: {}, ports_in: ['in'], ports_out: [] },
    { id: 'kpi_bottleneck', name: 'Bottleneck', icon: '⚠', category: 'kpis',
      description: 'Identifies the bottleneck node',
      config: {}, ports_in: ['in'], ports_out: [] },
    { id: 'kpi_efficiency', name: 'Efficiency', icon: '%', category: 'kpis',
      description: 'Process efficiency ratio',
      config: {}, ports_in: ['in'], ports_out: [] },
  ],
  displays: [
    { id: 'viz_entity_flow', name: 'Entity Flow', icon: '→', category: 'displays',
      description: 'Animated entity flow count on connection',
      config: {}, ports_in: ['in'], ports_out: ['out'] },
    { id: 'viz_histogram', name: 'Histogram', icon: '▥', category: 'displays',
      description: 'Distribution of a metric',
      config: { metric: 'service_time', bins: 15 }, ports_in: ['in'], ports_out: [] },
    { id: 'viz_timeline', name: 'Timeline', icon: '▤', category: 'displays',
      description: 'Gantt-style entity timeline',
      config: { max_entities: 20 }, ports_in: ['in'], ports_out: [] },
  ],
}
const VIZ_COLORS = { charts: '#60a5fa', kpis: '#f59e0b', displays: '#34d399' }

let _ctr = 0
const newId = () => `p${++_ctr}_${Date.now().toString(36)}`

function ProcPort({ direction, label, active, onStartWire, onEndWire }) {
  return (
    <div
      onPointerDown={e => { e.stopPropagation(); if (direction === 'out') onStartWire() }}
      onPointerUp={e => { e.stopPropagation(); if (direction === 'in') onEndWire() }}
      style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: direction === 'out' ? 'crosshair' : 'pointer' }}
    >
      {direction === 'in' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60a5fa', border: '2px solid #60a5fa', animation: 'port-pulse 2s ease-in-out infinite' }} />}
      <span style={{ fontSize: '.55rem', color: T.textMuted }}>{label}</span>
      {direction === 'out' && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#60a5fa', border: '2px solid #60a5fa', animation: 'port-pulse 2s ease-in-out infinite' }} />}
    </div>
  )
}

function ProcNode({ node, selected, onPointerDown, onStartWire, onEndWire, onRemove, onConfigChange, onRename, simResults }) {
  const [editing, setEditing] = useState(false)
  const catColor = CAT_COLORS[node.category] || '#60a5fa'
  const utilization = simResults?.summary?.server_utilization?.[node.id]
  const counterVal = simResults?.summary?.counter_values?.[node.id]

  return (
    <div onPointerDown={onPointerDown} style={{
      position: 'absolute', left: node.x, top: node.y, width: 170, minHeight: 60,
      background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${selected ? T.accent : T.glassBorder}`,
      borderTop: `3px solid ${catColor}40`, borderRadius: '10px', boxShadow: T.shadow,
      cursor: 'grab', userSelect: 'none', zIndex: selected ? 10 : 1, padding: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '.4rem .5rem .2rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
        <span style={{ fontSize: '.9rem' }}>{node.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input autoFocus value={node.label} style={{ ...inputMini, fontSize: '.72rem', fontWeight: 700, width: '100%' }}
              onChange={e => onRename(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditing(false) }}
              onPointerDown={e => e.stopPropagation()} />
          ) : (
            <div onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
              style={{ fontSize: '.72rem', fontWeight: 700, color: T.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}
              title="Double-click to rename">{node.label}</div>
          )}
          <div style={{ fontSize: '.55rem', color: catColor }}>{node.toolId}{node.process_name ? <span style={{ color: T.textMuted }}> · {node.process_name}</span> : ''}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '.7rem', padding: '1px' }}>×</button>
      </div>

      {/* Ports */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 .4rem .3rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {(node.ports_in || []).map((p, i) => (
            <ProcPort key={p} direction="in" label={p} active onStartWire={() => {}} onEndWire={() => onEndWire(node.id, p)} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
          {(node.ports_out || []).map((p, i) => (
            <ProcPort key={p} direction="out" label={p} active onStartWire={() => onStartWire(node.id, p)} onEndWire={() => {}} />
          ))}
        </div>
      </div>

      {/* Inline config */}
      <div style={{ borderTop: `1px solid ${catColor}20`, padding: '.25rem .4rem', fontSize: '.55rem' }}
        onPointerDown={e => e.stopPropagation()}>
        {node.toolId === 'source' && (
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            <div><span style={{ color: T.textMuted }}>λ</span> <input value={node.config?.inter_arrival ?? 5} type='number' step='0.5' style={{ ...inputMini, width: 30 }}
              onChange={e => onConfigChange({ ...node.config, inter_arrival: parseFloat(e.target.value) || 5 })} /></div>
            <select value={node.config?.distribution || 'exponential'} style={{ ...inputMini, width: 55 }}
              onChange={e => onConfigChange({ ...node.config, distribution: e.target.value })}>
              <option value="exponential">exp</option><option value="fixed">fixed</option><option value="uniform">unif</option><option value="normal">norm</option>
            </select>
            <div><span style={{ color: T.textMuted }}>n</span> <input value={node.config?.max_entities ?? 100} type='number' style={{ ...inputMini, width: 32 }}
              onChange={e => onConfigChange({ ...node.config, max_entities: parseInt(e.target.value) || 100 })} /></div>
          </div>
        )}
        {node.toolId === 'server' && (
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            <div><span style={{ color: T.textMuted }}>μ</span> <input value={node.config?.service_time ?? 3} type='number' step='0.5' style={{ ...inputMini, width: 30 }}
              onChange={e => onConfigChange({ ...node.config, service_time: parseFloat(e.target.value) || 3 })} /></div>
            <select value={node.config?.distribution || 'exponential'} style={{ ...inputMini, width: 55 }}
              onChange={e => onConfigChange({ ...node.config, distribution: e.target.value })}>
              <option value="exponential">exp</option><option value="fixed">fixed</option><option value="uniform">unif</option><option value="normal">norm</option>
            </select>
            <div><span style={{ color: T.textMuted }}>#</span> <input value={node.config?.num_servers ?? 1} type='number' min={1} style={{ ...inputMini, width: 24 }}
              onChange={e => onConfigChange({ ...node.config, num_servers: parseInt(e.target.value) || 1 })} /></div>
          </div>
        )}
        {node.toolId === 'delay' && (
          <div style={{ display: 'flex', gap: '3px' }}>
            <input value={node.config?.delay_time ?? 2} type='number' step='0.5' style={{ ...inputMini, width: 35 }}
              onChange={e => onConfigChange({ ...node.config, delay_time: parseFloat(e.target.value) || 2 })} />
            <select value={node.config?.distribution || 'fixed'} style={{ ...inputMini, width: 50 }}
              onChange={e => onConfigChange({ ...node.config, distribution: e.target.value })}>
              <option value="fixed">fixed</option><option value="exponential">exp</option><option value="uniform">unif</option>
            </select>
          </div>
        )}
        {node.toolId === 'queue' && (
          <div><span style={{ color: T.textMuted }}>cap</span> <input value={node.config?.capacity ?? 0} type='number' min={0} style={{ ...inputMini, width: 30 }}
            onChange={e => onConfigChange({ ...node.config, capacity: parseInt(e.target.value) || 0 })} /> <span style={{ color: T.textMuted, fontSize: '.5rem' }}>(0=∞)</span></div>
        )}
        {node.toolId === 'branch' && (
          <div><span style={{ color: T.textMuted }}>P(a)</span> <input value={node.config?.probability ?? 0.5} type='number' min={0} max={1} step='0.1' style={{ ...inputMini, width: 35 }}
            onChange={e => onConfigChange({ ...node.config, probability: parseFloat(e.target.value) || 0.5 })} /></div>
        )}
        {node.toolId === 'batch' && (
          <div><span style={{ color: T.textMuted }}>size</span> <input value={node.config?.batch_size ?? 5} type='number' min={1} style={{ ...inputMini, width: 28 }}
            onChange={e => onConfigChange({ ...node.config, batch_size: parseInt(e.target.value) || 5 })} /></div>
        )}
        {(node.toolId === 'resource' || node.toolId === 'store') && (
          <div><span style={{ color: T.textMuted }}>cap</span> <input value={node.config?.capacity ?? 1} type='number' min={1} style={{ ...inputMini, width: 28 }}
            onChange={e => onConfigChange({ ...node.config, capacity: parseInt(e.target.value) || 1 })} /></div>
        )}
        {(node.toolId === 'data_in' || node.toolId === 'data_out') && (
          <div>
            <div style={{ display: 'flex', gap: '3px', marginBottom: '3px', alignItems: 'center' }}>
              <span style={{ color: T.textMuted }}>cat</span>
              <select value={node.config?.category || 'data'} style={{ ...inputMini, flex: 1 }}
                onChange={e => onConfigChange({ ...node.config, category: e.target.value })}>
                {FABRIC_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: FABRIC_COLORS[node.config?.category || 'data'], flexShrink: 0 }} />
            </div>
            <input value={node.config?.name || ''} placeholder={`${node.toolId === 'data_in' ? 'input' : 'output'} name`}
              style={{ ...inputMini, width: '100%' }}
              onChange={e => onConfigChange({ ...node.config, name: e.target.value })} />
          </div>
        )}
      </div>

      {/* Sim results badge */}
      {utilization !== undefined && (
        <div style={{ padding: '2px .4rem', fontSize: '.55rem', background: 'rgba(96,165,250,0.1)', borderRadius: '0 0 10px 10px', textAlign: 'center' }}>
          <span style={{ color: '#60a5fa' }}>{utilization}% util</span>
        </div>
      )}
      {counterVal !== undefined && (
        <div style={{ padding: '2px .4rem', fontSize: '.55rem', background: 'rgba(52,211,153,0.1)', borderRadius: '0 0 10px 10px', textAlign: 'center' }}>
          <span style={{ color: '#34d399' }}>count: {counterVal}</span>
        </div>
      )}
      {/* Viz/KPI node results */}
      {simResults && node.toolId?.startsWith('viz_') && (() => {
        const vizData = simResults.viz_nodes?.[node.id]
        if (!vizData) return null
        const panelStyle = { padding: '3px .4rem', fontSize: '.55rem', background: 'rgba(96,165,250,0.08)', borderRadius: '0 0 10px 10px' }
        if (node.toolId === 'viz_throughput' && vizData.points?.length > 0) {
          const pts = vizData.points
          const mx = Math.max(...pts.map(p => p.v)) || 1
          return <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'end', gap: '1px', height: 25 }}>
              {pts.slice(-20).map((p, i) => <div key={i} style={{ flex: 1, height: `${(p.v / mx) * 100}%`, background: '#60a5fa', opacity: .6, borderRadius: '1px 1px 0 0', minHeight: 1 }} />)}
            </div>
            <div style={{ color: '#60a5fa', textAlign: 'center' }}>{vizData.latest?.toFixed(1)}/t</div>
          </div>
        }
        if (node.toolId === 'viz_utilization' && vizData.value !== undefined) {
          return <div style={panelStyle}>
            <div style={{ textAlign: 'center', fontSize: '.8rem', fontWeight: 800, color: vizData.value > 80 ? '#fca5a5' : '#60a5fa' }}>{vizData.value}%</div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${vizData.value}%`, height: '100%', background: vizData.value > 80 ? '#f87171' : '#60a5fa', borderRadius: 2 }} />
            </div>
          </div>
        }
        if (node.toolId === 'viz_wait_time' && vizData.avg !== undefined) {
          return <div style={{ ...panelStyle, textAlign: 'center' }}>
            <span style={{ color: T.textMuted }}>avg wait: </span><strong style={{ color: '#f59e0b' }}>{vizData.avg.toFixed(2)}</strong>
          </div>
        }
        if (node.toolId === 'viz_queue_length' && vizData.points?.length > 0) {
          const pts = vizData.points
          const mx = Math.max(...pts.map(p => p.v)) || 1
          return <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'end', gap: '1px', height: 20 }}>
              {pts.slice(-20).map((p, i) => <div key={i} style={{ flex: 1, height: `${(p.v / mx) * 100}%`, background: '#a78bfa', opacity: .6, borderRadius: '1px 1px 0 0', minHeight: 1 }} />)}
            </div>
            <div style={{ color: '#a78bfa', textAlign: 'center' }}>max: {mx}</div>
          </div>
        }
        if (node.toolId === 'viz_histogram' && vizData.bins?.length > 0) {
          const bins = vizData.bins
          const mx = Math.max(...bins) || 1
          return <div style={panelStyle}>
            <div style={{ fontSize: '.5rem', color: T.textMuted, marginBottom: '1px' }}>Distribution</div>
            <div style={{ display: 'flex', alignItems: 'end', gap: '1px', height: 30 }}>
              {bins.map((h, i) => <div key={i} style={{ flex: 1, height: `${(h / mx) * 100}%`, background: '#34d399', opacity: .6, borderRadius: '1px 1px 0 0', minHeight: h > 0 ? 2 : 0 }} title={`${h}`} />)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.45rem', color: T.textMuted }}>
              <span>{vizData.min}</span><span>{vizData.max}</span>
            </div>
          </div>
        }
        if (node.toolId === 'viz_timeline' && vizData.timeline?.length > 0) {
          return <div style={panelStyle}>
            <div style={{ fontSize: '.5rem', color: T.textMuted, marginBottom: '1px' }}>{vizData.timeline.length} entities</div>
            {vizData.timeline.slice(0, 5).map((ent, i) => (
              <div key={i} style={{ fontSize: '.45rem', color: T.textSecondary, borderBottom: '1px solid rgba(255,255,255,0.03)', padding: '1px 0' }}>
                {ent.id}: {ent.events?.length || 0} steps
              </div>
            ))}
          </div>
        }
        if (node.toolId === 'viz_entity_flow' && vizData.display) {
          return <div style={{ ...panelStyle, textAlign: 'center' }}>
            <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#34d399' }}>{vizData.display}</div>
            <div style={{ fontSize: '.5rem', color: T.textMuted }}>{vizData.detail}</div>
          </div>
        }
        // KPI nodes
        if (vizData.display) {
          return <div style={{ ...panelStyle, textAlign: 'center' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, color: '#f59e0b' }}>{vizData.display}</div>
            {vizData.detail && <div style={{ color: T.textMuted }}>{vizData.detail}</div>}
          </div>
        }
        return null
      })()}
    </div>
  )
}

function Wire({ x1, y1, x2, y2, label, onClick, onLabelChange }) {
  const dx = Math.abs(x2 - x1) * 0.5
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const [editing, setEditing] = React.useState(false)
  return (
    <g>
      <path d={d} stroke="#60a5fa" strokeWidth={2} fill="none" opacity={0.5}
        strokeDasharray="5,3" style={{ animation: 'wire-flow 1s linear infinite' }} />
      <path d={d} stroke="#60a5fa" strokeWidth={8} fill="none" opacity={0}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }} onClick={onClick} />
      {/* Wire label */}
      {editing ? (
        <foreignObject x={mx - 40} y={my - 10} width={80} height={20} style={{ pointerEvents: 'auto' }}>
          <input autoFocus value={label || ''} style={{
            background: 'rgba(0,0,0,0.7)', border: '1px solid #60a5fa', borderRadius: '3px',
            color: '#f0f4f8', fontSize: '.55rem', padding: '1px 4px', width: '100%', outline: 'none', textAlign: 'center',
          }}
            onChange={e => onLabelChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false) }} />
        </foreignObject>
      ) : (
        <text x={mx} y={my - 4} textAnchor="middle" fill={label ? '#60a5fa' : 'rgba(255,255,255,0.15)'}
          fontSize={label ? 9 : 8} style={{ pointerEvents: 'auto', cursor: 'text' }}
          onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}>
          {label || '+'}
        </text>
      )}
    </g>
  )
}

function LibItem({ icon, name, color, onDragStart }) {
  return (
    <div draggable onDragStart={onDragStart} style={{
      background: T.glassBg, border: `1px solid ${T.glassBorder}`, borderLeft: `3px solid ${color}`,
      borderRadius: '6px', padding: '.3rem .5rem', cursor: 'grab', fontSize: '.72rem',
      display: 'flex', alignItems: 'center', gap: '.3rem', userSelect: 'none',
    }}>
      <span style={{ fontSize: '.8rem', opacity: .7 }}>{icon}</span>
      <span style={{ color: T.textPrimary, fontWeight: 600 }}>{name}</span>
    </div>
  )
}

export default function ProcessCanvas({ authFetch, apiBase }) {
  const [nodes, setNodes] = useState([])
  const [connections, setConnections] = useState([])
  const [dragging, setDragging] = useState(null)
  const [wiring, setWiring] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState(null)
  const [procName, setProcName] = useState('')
  const [procId, setProcId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [simStatus, setSimStatus] = useState(null) // null | { status, summary, events, ... }
  const [simConfig, setSimConfig] = useState({ duration: 100, seed: 42 })
  const canvasRef = useRef(null)

  const glass = { background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${T.glassBorder}`, borderRadius: '12px', boxShadow: T.shadow }

  // Port position
  const getPortPos = useCallback((nodeId, portName, direction) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return { x: 0, y: 0 }
    const ports = direction === 'in' ? (node.ports_in || []) : (node.ports_out || [])
    const idx = ports.indexOf(portName)
    const row = idx >= 0 ? idx : 0
    const yOff = 42 + row * 14
    return { x: direction === 'out' ? node.x + 170 : node.x, y: node.y + yOff }
  }, [nodes])

  const handlePointerDown = (e, nodeId) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setSelectedNode(nodeId)
    const rect = canvasRef.current.getBoundingClientRect()
    setDragging({ nodeId, ox: e.clientX - rect.left - node.x, oy: e.clientY - rect.top - node.y })
  }
  const handlePointerMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setMousePos({ x: mx, y: my })
    if (dragging) setNodes(prev => prev.map(n => n.id === dragging.nodeId ? { ...n, x: Math.max(0, mx - dragging.ox), y: Math.max(0, my - dragging.oy) } : n))
  }
  const handlePointerUp = () => { setDragging(null); if (wiring) setWiring(null) }
  const startWire = (nodeId, port) => setWiring({ fromNodeId: nodeId, fromPort: port })
  const endWire = (nodeId, port) => {
    if (!wiring || wiring.fromNodeId === nodeId) { setWiring(null); return }
    const exists = connections.some(c => c.fromNodeId === wiring.fromNodeId && c.fromPort === wiring.fromPort && c.toNodeId === nodeId && c.toPort === port)
    if (!exists) setConnections(prev => [...prev, { id: newId(), fromNodeId: wiring.fromNodeId, fromPort: wiring.fromPort, toNodeId: nodeId, toPort: port }])
    setWiring(null)
  }
  const removeNode = (nid) => { setNodes(prev => prev.filter(n => n.id !== nid)); setConnections(prev => prev.filter(c => c.fromNodeId !== nid && c.toNodeId !== nid)) }
  const handleDrop = (e) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('application/json')
    if (!data) return
    const item = JSON.parse(data)
    const rect = canvasRef.current.getBoundingClientRect()
    setNodes(prev => [...prev, { ...item, id: newId(), x: Math.max(0, e.clientX - rect.left - 85), y: Math.max(0, e.clientY - rect.top - 30) }])
  }

  // Load last saved
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${apiBase}/api/process/`)
        if (!res.ok) return
        const list = await res.json()
        if (list.length > 0) {
          const d = await (await authFetch(`${apiBase}/api/process/${list[0].id}/`)).json()
          if (d.canvas_state?.nodes?.length > 0) {
            setNodes(d.canvas_state.nodes || []); setConnections(d.canvas_state.connections || [])
            setProcName(d.name || ''); setProcId(d.id)
            if (d.sim_config) setSimConfig(d.sim_config)
            if (d.sim_results && Object.keys(d.sim_results).length > 0) {
              setSimStatus({ status: d.status === 'built' ? 'completed' : d.status, sim_results: d.sim_results, sim_log: d.sim_log })
            }
            if (d.status === 'built' && d.resulting_twin_id) {
              setBuildResult({ twin_id: d.resulting_twin_id })
            }
            setLastSaved(new Date().toLocaleTimeString())
          }
        }
      } catch {}
    })()
  }, [])

  const handleSave = async () => {
    if (!procName.trim()) { alert('Name your process model'); return }
    setSaving(true)
    const cs = { nodes, connections }
    try {
      if (procId) {
        await authFetch(`${apiBase}/api/process/${procId}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: procName, canvas_state: cs, sim_config: simConfig }) })
      } else {
        const res = await authFetch(`${apiBase}/api/process/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: procName, canvas_state: cs, sim_config: simConfig }) })
        if (res.ok) { const d = await res.json(); setProcId(d.id) }
      }
      setLastSaved(new Date().toLocaleTimeString())
      loadMyProcesses()
    } catch {}
    setSaving(false)
  }

  const handleSimulate = async () => {
    await handleSave()
    if (!procId) return
    try {
      const res = await authFetch(`${apiBase}/api/process/${procId}/simulate`, { method: 'POST' })
      if (res.ok) {
        setSimStatus({ status: 'running' })
        setBuildResult(null)
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Failed to start simulation')
      }
    } catch (e) {
      alert('Simulation error: ' + e.message)
    }
  }

  // Poll sim status
  useEffect(() => {
    if (!simStatus || simStatus.status !== 'running' || !procId) return
    let failures = 0
    const iv = setInterval(async () => {
      try {
        const res = await authFetch(`${apiBase}/api/process/${procId}/status`)
        if (!res.ok) {
          failures++
          if (failures > 5) { clearInterval(iv); setSimStatus(prev => ({ ...prev, status: 'failed', sim_log: 'Status polling failed (auth expired). Refresh the page.' })) }
          return
        }
        failures = 0
        const d = await res.json()
        setSimStatus(d)
        if (d.status === 'completed' || d.status === 'failed' || d.status === 'built') clearInterval(iv)
      } catch {
        failures++
        if (failures > 5) clearInterval(iv)
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [simStatus?.status, procId])

  const [buildResult, setBuildResult] = useState(null)

  const handleLockBuild = async () => {
    if (!procId) { await handleSave() }
    if (!procId) { alert('Save the model first'); return }
    if (simStatus?.status !== 'completed') { alert('Run simulation first'); return }
    try {
      const res = await authFetch(`${apiBase}/api/process/${procId}/build`, { method: 'POST' })
      const d = await res.json()
      if (res.ok) {
        setBuildResult(d)
        setSimStatus(prev => ({ ...prev, status: 'built' }))
        loadMyProcesses()
      } else {
        alert(d.error || 'Build failed')
      }
    } catch (e) { alert('Build error: ' + e.message) }
  }

  const [myProcesses, setMyProcesses] = useState([])
  const loadMyProcesses = async () => {
    try {
      const res = await authFetch(`${apiBase}/api/process/`)
      if (res.ok) setMyProcesses(await res.json())
    } catch {}
  }
  useEffect(() => { loadMyProcesses() }, [])

  const loadProcess = async (id) => {
    try {
      const res = await authFetch(`${apiBase}/api/process/${id}/`)
      if (!res.ok) return
      const d = await res.json()
      setNodes(d.canvas_state?.nodes || [])
      setConnections(d.canvas_state?.connections || [])
      setProcName(d.name || '')
      setProcId(d.id)
      if (d.sim_config) setSimConfig(d.sim_config)
      setSimStatus(null)
      setBuildResult(null)
      if (d.sim_results && Object.keys(d.sim_results).length > 0) {
        setSimStatus({ status: d.status === 'built' ? 'completed' : d.status, sim_results: d.sim_results, sim_log: d.sim_log })
      }
      if (d.status === 'built' && d.resulting_twin_id) {
        setBuildResult({ twin_id: d.resulting_twin_id })
      }
      setLastSaved(new Date().toLocaleTimeString())
    } catch {}
  }

  const handleClear = () => {
    if (nodes.length > 0 && !confirm('Clear canvas?')) return
    setNodes([]); setConnections([]); setSelectedNode(null); setProcId(null); setProcName(''); setSimStatus(null); setLastSaved(null); setBuildResult(null)
  }

  const handleDeleteProcess = async (id, name) => {
    if (!confirm(`Delete process "${name}"? This cannot be undone.`)) return
    try {
      const res = await authFetch(`${apiBase}/api/process/${id}/`, { method: 'DELETE' })
      if (res.ok) {
        if (procId === id) handleNew()
        loadMyProcesses()
      }
    } catch {}
  }

  const handleNew = () => {
    if (nodes.length > 0 && !confirm('Start a new process? Unsaved changes will be lost.')) return
    setNodes([]); setConnections([]); setSelectedNode(null); setProcId(null); setProcName(''); setSimStatus(null); setLastSaved(null); setBuildResult(null)
  }

  const bpmnInputRef = useRef(null)
  const [bpmnImporting, setBpmnImporting] = useState(false)
  const [processBoundaries, setProcessBoundaries] = useState([])
  const handleBpmnImport = async (file) => {
    if (!file) return
    setBpmnImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await authFetch(`${apiBase}/api/process/import-bpmn`, { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Import failed'); setBpmnImporting(false); return }
      // Scale positions to fit canvas
      const minX = Math.min(...d.nodes.map(n => n.x || 0))
      const minY = Math.min(...d.nodes.map(n => n.y || 0))
      const scaled = d.nodes.map(n => ({ ...n, x: (n.x || 0) - minX + 40, y: (n.y || 0) - minY + 40 }))
      setNodes(scaled)
      setConnections(d.connections || [])
      // Adjust boundary positions too
      const boundaries = (d.process_boundaries || []).map(b => ({
        ...b, x: (b.x || 0) - minX + 40, y: (b.y || 0) - minY + 40,
      }))
      setProcessBoundaries(boundaries)
      if (!procName) setProcName(file.name.replace(/\.(bpmn|xml)$/i, ''))
      setSimStatus(null)
    } catch (e) { alert('Import error: ' + e.message) }
    setBpmnImporting(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
    <div style={{ display: 'flex', gap: '.75rem', height: 'calc(100vh - 160px)', flexShrink: 0 }}>
      {/* Left: BPMN import + Element library */}
      <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '.5rem', overflow: 'auto' }}>
        {/* BPMN Import */}
        <div
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleBpmnImport(f) }}
          onClick={() => bpmnInputRef.current?.click()}
          style={{
            ...glass, padding: '.6rem', textAlign: 'center', cursor: 'pointer',
            border: '1px dashed rgba(99,102,241,0.3)', borderRadius: '10px',
          }}>
          <input ref={bpmnInputRef} type="file" accept=".bpmn,.xml" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files[0]; if (f) handleBpmnImport(f) }} />
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.accent, marginBottom: '.15rem' }}>
            {bpmnImporting ? 'Importing...' : '↑ Import BPMN'}
          </div>
          <div style={{ fontSize: '.55rem', color: T.textMuted }}>
            Drop .bpmn file or click
          </div>
        </div>

        <CollapsiblePanel title="My Processes" color="#f472b6"
          extra={<button onClick={e => { e.stopPropagation(); handleNew() }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: T.textMuted, fontSize: '.55rem', padding: '1px 5px', cursor: 'pointer' }}>+ New</button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', maxHeight: 150, overflow: 'auto' }}>
            {myProcesses.map(p => (
              <div key={p.id} style={{
                padding: '.2rem .35rem', borderRadius: '5px', fontSize: '.63rem',
                background: procId === p.id ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)',
                border: procId === p.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', gap: '.2rem',
              }}>
                <div onClick={() => loadProcess(p.id)} style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: T.textPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 95 }}>{p.name}</span>
                    <span style={{
                      fontSize: '.48rem', padding: '0 3px', borderRadius: '3px',
                      background: p.status === 'built' ? 'rgba(52,211,153,0.2)' : p.status === 'completed' ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
                      color: p.status === 'built' ? '#34d399' : p.status === 'completed' ? '#60a5fa' : T.textMuted,
                    }}>{p.status}</span>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDeleteProcess(p.id, p.name) }} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '.6rem', padding: '0 2px', flexShrink: 0,
                }} title="Delete">×</button>
              </div>
            ))}
            {myProcesses.length === 0 && <div style={{ fontSize: '.63rem', color: T.textMuted }}>No saved processes</div>}
          </div>
        </CollapsiblePanel>

        {Object.entries(ELEMENTS).map(([cat, elems]) => (
          <CollapsiblePanel key={cat} title={cat} color={CAT_COLORS[cat]}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {elems.map(el => (
                <LibItem key={el.id} icon={el.icon} name={el.name} color={CAT_COLORS[cat]}
                  onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                    toolId: el.id, label: el.name, icon: el.icon, category: cat,
                    config: JSON.parse(JSON.stringify(el.config)),
                    ports_in: [...el.ports_in], ports_out: [...el.ports_out],
                  }))} />
              ))}
            </div>
          </CollapsiblePanel>
        ))}
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {/* Controls */}
        <div style={{ ...glass, padding: '.5rem .75rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
          <input value={procName} onChange={e => setProcName(e.target.value)} placeholder="Process model name..."
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: T.textPrimary, padding: '.3rem .5rem', fontSize: '.82rem', flex: 1, minWidth: 130, outline: 'none' }} />
          <span style={{ fontSize: '.7rem', color: T.textMuted }}>{nodes.length} nodes{lastSaved ? ` · saved ${lastSaved}` : ''}</span>
          <button onClick={handleSave} disabled={saving || !nodes.length} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: '6px',
            color: T.textSecondary, padding: '.3rem .6rem', cursor: 'pointer', fontSize: '.78rem', opacity: !nodes.length ? .4 : 1,
          }}>{saving ? 'Saving...' : 'Save'}</button>
          <button onClick={handleClear} style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px',
            color: '#fca5a5', padding: '.3rem .6rem', cursor: 'pointer', fontSize: '.78rem',
          }}>Clear</button>

          {/* Sim config */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '.5rem' }}>
            <span style={{ fontSize: '.65rem', color: T.textMuted }}>T</span>
            <input value={simConfig.duration} type='number' min={1} style={{ ...inputMini, width: 40 }}
              onChange={e => setSimConfig({ ...simConfig, duration: parseInt(e.target.value) || 100 })} />
            <span style={{ fontSize: '.65rem', color: T.textMuted }}>seed</span>
            <input value={simConfig.seed} type='number' style={{ ...inputMini, width: 32 }}
              onChange={e => setSimConfig({ ...simConfig, seed: parseInt(e.target.value) || 42 })} />
          </div>

          <button onClick={handleSimulate} disabled={!nodes.length || simStatus?.status === 'running'} style={{
            background: 'rgba(16,185,129,0.4)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: '8px',
            color: '#fff', padding: '.35rem .8rem', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
            opacity: !nodes.length ? .4 : 1,
          }}>{simStatus?.status === 'running' ? 'Running...' : '▶ Simulate'}</button>
          {simStatus?.status === 'completed' && !buildResult && (
            <button onClick={handleLockBuild} style={{
              background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: '8px',
              color: '#fff', padding: '.35rem .8rem', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
            }}>Lock & Build</button>
          )}
          {buildResult && (
            <span style={{ fontSize: '.75rem', color: '#34d399', fontWeight: 600 }}>
              Built as {buildResult.twin_id}
            </span>
          )}
        </div>

        {/* Canvas */}
        <div ref={canvasRef} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
          onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          style={{
            ...glass, flex: 1, position: 'relative', overflow: 'auto',
            background: 'rgba(0,0,0,0.15)', borderRadius: '14px',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}>
          {nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: T.textMuted }}><div style={{ fontSize: '1.5rem', opacity: .3, marginBottom: '.3rem' }}>⚙</div>Drag process elements here</div>
            </div>
          )}

          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {connections.map(c => {
              const from = getPortPos(c.fromNodeId, c.fromPort, 'out')
              const to = getPortPos(c.toNodeId, c.toPort, 'in')
              return <Wire key={c.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                label={c.label || ''}
                onClick={() => setConnections(prev => prev.filter(cc => cc.id !== c.id))}
                onLabelChange={lbl => setConnections(prev => prev.map(cc => cc.id === c.id ? { ...cc, label: lbl } : cc))} />
            })}
            {wiring && (() => {
              const from = getPortPos(wiring.fromNodeId, wiring.fromPort, 'out')
              return <Wire x1={from.x} y1={from.y} x2={mousePos.x} y2={mousePos.y} onClick={() => {}} />
            })()}
          </svg>

          {/* Process boundaries */}
          {processBoundaries.map((b, i) => (
            <div key={`boundary_${i}`} style={{
              position: 'absolute', left: b.x, top: b.y, width: b.width, height: b.height,
              border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute', top: -16, left: 8,
                fontSize: '.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: '4px',
              }}>{b.name}</div>
            </div>
          ))}

          {nodes.map(n => (
            <ProcNode key={n.id} node={n} selected={selectedNode === n.id}
              onPointerDown={e => handlePointerDown(e, n.id)}
              onStartWire={startWire} onEndWire={endWire}
              onRemove={() => removeNode(n.id)}
              onRename={name => setNodes(prev => prev.map(nd => nd.id === n.id ? { ...nd, label: name } : nd))}
              onConfigChange={cfg => setNodes(prev => prev.map(nd => nd.id === n.id ? { ...nd, config: cfg } : nd))}
              simResults={simStatus?.status === 'completed' ? simStatus.sim_results : null}
            />
          ))}
        </div>

      </div>
      {/* ── Simulation results — below the canvas ────────────────── */}
      {simStatus?.status === 'completed' && simStatus.sim_results?.summary && (() => {
          const s = simStatus.sim_results.summary
          const times = simStatus.sim_results.entity_times || []
          const events = simStatus.sim_results.events || []
          return (
          <div style={{ ...glass, padding: '.75rem 1rem' }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, color: T.textPrimary, marginBottom: '.75rem' }}>Simulation Results — {s.duration} time units</div>

            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '.5rem', marginBottom: '.75rem' }}>
              {[
                { label: 'Entities Created', value: s.entities_created, color: '#60a5fa', icon: '▶' },
                { label: 'Entities Completed', value: s.entities_completed, color: '#34d399', icon: '■' },
                { label: 'Avg Cycle Time', value: s.avg_time_in_system, unit: ' t', color: '#f59e0b', icon: '⟳' },
                { label: 'Min Cycle Time', value: s.min_time, unit: ' t', color: '#a78bfa', icon: '↓' },
                { label: 'Max Cycle Time', value: s.max_time, unit: ' t', color: '#a78bfa', icon: '↑' },
                { label: 'Throughput', value: s.throughput, unit: '/t', color: '#60a5fa', icon: '📈' },
              ].map(kpi => (
                <div key={kpi.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '.5rem', borderLeft: `3px solid ${kpi.color}` }}>
                  <div style={{ fontSize: '.55rem', color: T.textMuted, marginBottom: '.2rem' }}>{kpi.icon} {kpi.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: kpi.color }}>{kpi.value}{kpi.unit || ''}</div>
                </div>
              ))}
            </div>

            {/* Server utilization bars */}
            {Object.keys(s.server_utilization || {}).length > 0 && (
              <div style={{ marginBottom: '.75rem' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.textPrimary, marginBottom: '.4rem' }}>Server Utilization (%)</div>
                {Object.entries(s.server_utilization).map(([nid, pct]) => {
                  const label = nodes.find(n => n.id === nid)?.label || nid
                  return (
                    <div key={nid} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.25rem' }}>
                      <span style={{ fontSize: '.65rem', color: T.textMuted, minWidth: 80, textAlign: 'right' }}>{label}</span>
                      <div style={{ flex: 1, height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#f87171' : pct > 50 ? '#f59e0b' : '#34d399', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: '.65rem', color: pct > 80 ? '#fca5a5' : T.textSecondary, minWidth: 30 }}>{pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Cycle time histogram */}
            {times.length > 0 && (() => {
              const mn = Math.min(...times), mx = Math.max(...times), rng = mx - mn || 1
              const nBins = 20, bw = rng / nBins
              const hist = Array(nBins).fill(0)
              times.forEach(t => { const b = Math.min(nBins - 1, Math.floor((t - mn) / bw)); hist[b]++ })
              const maxH = Math.max(...hist) || 1
              return (
                <div style={{ marginBottom: '.75rem' }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.textPrimary, marginBottom: '.3rem' }}>Cycle Time Distribution (entity time in system)</div>
                  <div style={{ display: 'flex', alignItems: 'end', gap: '1px', height: 60 }}>
                    {hist.map((h, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '100%', height: `${(h / maxH) * 50}px`, background: '#60a5fa', opacity: .6, borderRadius: '2px 2px 0 0', minHeight: h > 0 ? 2 : 0 }}
                          title={`Range: ${(mn + i * bw).toFixed(1)} – ${(mn + (i + 1) * bw).toFixed(1)}\nCount: ${h} entities`} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.55rem', color: T.textMuted, marginTop: '2px' }}>
                    <span>{mn.toFixed(1)} t</span>
                    <span style={{ color: T.textSecondary }}>← Entity Time in System (time units) →</span>
                    <span>{mx.toFixed(1)} t</span>
                  </div>
                  <div style={{ fontSize: '.55rem', color: T.textMuted, textAlign: 'center', marginTop: '1px' }}>
                    Y-axis: Number of entities | Each bar = {bw.toFixed(1)} time unit range
                  </div>
                </div>
              )
            })()}

            {/* Counter values */}
            {Object.keys(s.counter_values || {}).length > 0 && (
              <div style={{ marginBottom: '.5rem' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: T.textPrimary, marginBottom: '.3rem' }}>Counters</div>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {Object.entries(s.counter_values).map(([nid, val]) => {
                    const label = nodes.find(n => n.id === nid)?.label || nid
                    return <div key={nid} style={{ background: 'rgba(52,211,153,0.1)', borderRadius: '6px', padding: '.2rem .5rem', fontSize: '.7rem' }}>
                      <span style={{ color: T.textMuted }}>{label}: </span><strong style={{ color: '#34d399' }}>{val}</strong>
                    </div>
                  })}
                </div>
              </div>
            )}

            {/* Event log */}
            <details style={{ marginTop: '.5rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '.72rem', color: T.accent, fontWeight: 600 }}>Event Log ({events.length} events)</summary>
              <div style={{ maxHeight: 200, overflow: 'auto', marginTop: '.3rem', fontSize: '.65rem' }}>
                <div style={{ display: 'flex', gap: '.5rem', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: T.textMuted }}>
                  <span style={{ minWidth: 40 }}>Time</span>
                  <span style={{ minWidth: 60 }}>Event</span>
                  <span style={{ minWidth: 80 }}>Node</span>
                  <span style={{ minWidth: 40 }}>Entity</span>
                  <span>Details</span>
                </div>
                {events.slice(-50).map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.5rem', padding: '1px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', color: T.textSecondary }}>
                    <span style={{ color: T.textMuted, minWidth: 40 }}>{ev.t}</span>
                    <span style={{ minWidth: 60, color: ev.event === 'created' ? '#60a5fa' : ev.event === 'completed' ? '#34d399' : ev.event === 'served' ? '#f59e0b' : T.textSecondary }}>{ev.event}</span>
                    <span style={{ minWidth: 80, color: T.textMuted }}>{ev.node}</span>
                    <span style={{ minWidth: 40 }}>{ev.entity}</span>
                    <span>
                      {ev.wait !== undefined && <span style={{ color: '#f59e0b' }}>wait={ev.wait} </span>}
                      {ev.service !== undefined && <span style={{ color: '#a78bfa' }}>svc={ev.service} </span>}
                      {ev.lifetime !== undefined && <span style={{ color: '#34d399' }}>life={ev.lifetime}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )})()}
      {/* Right: Visualization & KPI tools */}
      <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '.5rem', overflow: 'auto' }}>
        {Object.entries(VIZ_KPI_TOOLS).map(([cat, tools]) => (
          <CollapsiblePanel key={cat} title={cat} color={VIZ_COLORS[cat]}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              {tools.map(tool => (
                <LibItem key={tool.id} icon={tool.icon} name={tool.name} color={VIZ_COLORS[cat]}
                  onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                    toolId: tool.id, label: tool.name, icon: tool.icon, category: tool.category,
                    config: JSON.parse(JSON.stringify(tool.config)),
                    ports_in: [...tool.ports_in], ports_out: [...(tool.ports_out || [])],
                  }))} />
              ))}
            </div>
          </CollapsiblePanel>
        ))}
      </div>
    </div>
    {/* Status messages below canvas */}
    {simStatus?.status === 'failed' && (
      <div style={{ ...glass, padding: '.5rem .75rem', fontSize: '.8rem', color: '#fca5a5' }}>
        Simulation failed: {simStatus.sim_log}
      </div>
    )}
    {simStatus?.status === 'running' && (
      <div style={{ ...glass, padding: '.5rem .75rem', fontSize: '.8rem', color: T.accent }}>
        Running simulation...
      </div>
    )}
    </div>
  )
}
