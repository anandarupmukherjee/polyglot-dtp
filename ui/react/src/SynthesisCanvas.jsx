import React, { useState, useRef, useEffect, useCallback } from 'react'

// ─── Design tokens (matching App.jsx) ─────────────────────────────────────────
const T = {
  textPrimary: '#f0f4f8', textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)', accent: '#818cf8',
  accentBg: 'rgba(99,102,241,0.55)', accentBorder: 'rgba(99,102,241,0.45)',
  glassBg: 'rgba(255,255,255,0.07)', glassBorder: 'rgba(255,255,255,0.12)',
  shadow: '0 8px 32px rgba(0,0,0,0.35)',
}
const PORT_COLORS = { data: '#60a5fa', decisions: '#f59e0b', queries: '#a78bfa', state: '#34d399' }
const PORT_CATEGORIES = ['data', 'decisions', 'queries', 'state']

// ─── Inject keyframes ────────────────────────────────────────────────────────
if (!document.querySelector('#synth-keyframes')) {
  const s = document.createElement('style')
  s.id = 'synth-keyframes'
  s.textContent = `
    @keyframes port-pulse { 0%,100% { box-shadow: 0 0 4px currentColor; } 50% { box-shadow: 0 0 12px currentColor, 0 0 20px currentColor; } }
    @keyframes wire-flow { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
  `
  document.head.appendChild(s)
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const ANALYSIS_TOOLS = [
  { id: 'moving_average', name: 'Moving Average', icon: '〰', portsIn: ['data'], portsOut: ['data'], config: { window: 10 } },
  { id: 'anomaly_detection', name: 'Anomaly Detect', icon: '⚠', portsIn: ['data'], portsOut: ['decisions'], config: { threshold: 2.0 } },
  { id: 'aggregator', name: 'Aggregator', icon: 'Σ', portsIn: ['data'], portsOut: ['data'], config: { window_sec: 60 } },
  { id: 'correlation', name: 'Correlation', icon: '⊗', portsIn: ['data', 'data'], portsOut: ['decisions'], config: { window: 30 } },
  { id: 'trend_detection', name: 'Trend Detection', icon: '↗', portsIn: ['data'], portsOut: ['decisions'], config: { sensitivity: 0.5 } },
]
const VIZ_TOOLS = [
  { id: 'timeseries_chart', name: 'Time Series', icon: '📈', portsIn: ['data'], portsOut: [] },
  { id: 'gauge', name: 'Gauge', icon: '⊙', portsIn: ['data'], portsOut: [] },
  { id: 'status_dashboard', name: 'Status Board', icon: '▦', portsIn: ['state'], portsOut: [] },
  { id: 'alert_log', name: 'Alert Log', icon: '⚡', portsIn: ['decisions'], portsOut: [] },
  { id: 'heatmap', name: 'Heatmap', icon: '▥', portsIn: ['data'], portsOut: [] },
  { id: 'camera_view', name: 'Camera View', icon: '◎', portsIn: ['data'], portsOut: [] },
]

// ─── Right-panel tool definitions ─────────────────────────────────────────────
const SERVICE_TOOLS = [
  { id: 'sensor', name: 'Sensor', icon: '⦿', type: 'service', subtype: 'sensor',
    portsIn: [], portsOut: ['data'],
    config: { protocol: 'MQTT', topic: '', frequency_sec: 5, qos: 0, fields: '', broker: '', port: 1883 } },
  { id: 'actuator', name: 'Actuator', icon: '⏻', type: 'service', subtype: 'actuator',
    portsIn: ['data', 'decisions', 'queries'], portsOut: ['state'],
    config: { protocol: 'MQTT', topic: '', frequency_sec: 0, qos: 1, fields: '', broker: '', port: 1883 } },
  { id: 'vision_sensor', name: 'Vision Sensor', icon: '◎', type: 'service', subtype: 'vision',
    portsIn: [], portsOut: ['data'],
    config: { protocol: 'HTTP', stream_url: '', stream_type: 'snapshot', snapshot_interval_sec: 5, resolution: '', mqtt_meta_topic: '', broker: '', port: 1883 } },
  { id: 'data_input', name: 'Data Input', icon: '⇥', type: 'service', subtype: 'data_input',
    portsIn: [], portsOut: ['data'],
    config: { protocol: 'MQTT', topic: '', qos: 0, fields: '', broker: '', port: 1883 } },
  { id: 'data_output', name: 'Data Output', icon: '⇤', type: 'service', subtype: 'data_output',
    portsIn: ['data', 'decisions', 'queries'], portsOut: ['state'],
    config: { protocol: 'MQTT', topic: '', qos: 1, fields: '', broker: '', port: 1883 } },
]

const DATABASE_TOOLS = [
  { id: 'db_sql', name: 'SQL Database', icon: '⊞', type: 'database', subtype: 'sql', portsIn: ['data'], portsOut: ['queries'], config: { engine: 'postgresql', table: '' } },
  { id: 'db_timeseries', name: 'InfluxDB', icon: '⏱', type: 'database', subtype: 'timeseries', portsIn: ['data'], portsOut: ['queries'], config: { bucket: '', measurement: '' } },
  { id: 'db_graph', name: 'Neo4j', icon: '⬡', type: 'database', subtype: 'graph', portsIn: ['data', 'state'], portsOut: ['queries'], config: { label: '' } },
]

const TRANSFORM_TOOLS = [
  { id: 'transform_text_to_int', name: 'Text → Int', icon: '⇌', type: 'transform', subtype: 'text_to_int',
    portsIn: ['data', 'decisions', 'queries', 'state'], portsOut: ['data', 'decisions', 'queries', 'state'],
    config: { mappings: [{ text: 'ON', value: 1 }, { text: 'OFF', value: 0 }] } },
  { id: 'transform_scale', name: 'Scale / Offset', icon: '×', type: 'transform', subtype: 'scale', portsIn: ['data'], portsOut: ['data'],
    config: { multiply: 1, offset: 0 } },
  { id: 'transform_filter', name: 'Filter', icon: '⊳', type: 'transform', subtype: 'filter', portsIn: ['data'], portsOut: ['data'],
    config: { field: 'value', operator: '>', threshold: 0 } },
  { id: 'transform_json_extract', name: 'JSON Extract', icon: '{}', type: 'transform', subtype: 'json_extract',
    portsIn: ['data', 'decisions', 'queries', 'state'], portsOut: ['data', 'decisions', 'queries', 'state'],
    config: { path: '' } },
]

function CollapsiblePanel({ title, color, children, defaultOpen = true }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div style={{
      background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${T.glassBorder}`, borderRadius: '10px', boxShadow: T.shadow,
      overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        padding: '.45rem .6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}>
        <span style={{ fontSize: '.72rem', color: color || T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</span>
        <span style={{ fontSize: '.6rem', color: T.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </div>
      {open && <div style={{ padding: '0 .6rem .5rem' }}>{children}</div>}
    </div>
  )
}

// ─── Embedded process diagram (read-only mini view) ───────────────────────────
function ProcessDiagramEmbed({ processId, authFetch, apiBase }) {
  const [procData, setProcData] = React.useState(null)
  React.useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${apiBase}/api/process/${processId}/`)
        if (res.ok) setProcData(await res.json())
      } catch {}
    })()
  }, [processId])

  if (!procData?.canvas_state?.nodes?.length) return <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '.8rem', padding: '.5rem' }}>Loading process diagram...</div>

  const nodes = procData.canvas_state.nodes
  const conns = procData.canvas_state.connections || []
  const summary = (procData.sim_results || {}).summary || {}

  // Calculate bounds for scaling
  const xs = nodes.map(n => n.x || 0), ys = nodes.map(n => n.y || 0)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const maxX = Math.max(...xs) + 170, maxY = Math.max(...ys) + 70
  const W = maxX - minX + 40, H = maxY - minY + 40
  const scale = Math.min(1, 620 / W, 300 / H)

  const catColors = { flow: '#60a5fa', routing: '#f59e0b', resources: '#a78bfa', monitoring: '#34d399', connectors: '#f472b6' }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.4rem' }}>
        Process Diagram — {nodes.length} nodes
        {summary.throughput != null && <span style={{ color: '#60a5fa', marginLeft: '.5rem' }}>tp: {summary.throughput}/t</span>}
      </div>
      <div style={{ position: 'relative', width: W * scale, height: H * scale, background: 'rgba(0,0,0,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
        <svg width={W * scale} height={H * scale} style={{ position: 'absolute', inset: 0 }}>
          {conns.map((c, i) => {
            const src = nodes.find(n => n.id === c.fromNodeId)
            const tgt = nodes.find(n => n.id === c.toNodeId)
            if (!src || !tgt) return null
            const x1 = ((src.x || 0) - minX + 170) * scale, y1 = ((src.y || 0) - minY + 30) * scale
            const x2 = ((tgt.x || 0) - minX) * scale, y2 = ((tgt.y || 0) - minY + 30) * scale
            const dx = Math.abs(x2 - x1) * 0.4
            return <path key={i} d={`M${x1} ${y1} C${x1+dx} ${y1},${x2-dx} ${y2},${x2} ${y2}`} stroke="#60a5fa" strokeWidth={1} fill="none" opacity={0.3} />
          })}
        </svg>
        {nodes.map(n => {
          const color = catColors[n.category] || '#60a5fa'
          return (
            <div key={n.id} style={{
              position: 'absolute',
              left: ((n.x || 0) - minX) * scale, top: ((n.y || 0) - minY) * scale,
              width: 160 * scale, height: 50 * scale,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${color}40`,
              borderTop: `2px solid ${color}60`, borderRadius: 4 * scale,
              padding: `${2*scale}px ${4*scale}px`, overflow: 'hidden',
            }}>
              <div style={{ fontSize: `${Math.max(7, 10 * scale)}px`, color: '#f0f4f8', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.icon} {n.label}
              </div>
              <div style={{ fontSize: `${Math.max(5, 7 * scale)}px`, color: 'rgba(255,255,255,0.35)' }}>{n.toolId}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputMini = {
  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '3px', color: '#f0f4f8', padding: '2px 4px', fontSize: '.6rem', outline: 'none',
}

let _nodeIdCounter = 0
const newId = () => `n${++_nodeIdCounter}_${Date.now().toString(36)}`

// ─── Port component ──────────────────────────────────────────────────────────
function Port({ category, direction, active, x, y, onStartWire, onEndWire, wiring }) {
  const color = PORT_COLORS[category] || '#888'
  return (
    <div
      onPointerDown={e => { e.stopPropagation(); if (active && direction === 'out') onStartWire(category) }}
      onPointerUp={e => { e.stopPropagation(); if (active && direction === 'in') onEndWire(category) }}
      style={{
        width: 14, height: 14, borderRadius: '50%',
        background: active ? color : 'rgba(255,255,255,0.08)',
        border: `2px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
        cursor: active ? (direction === 'out' ? 'crosshair' : 'pointer') : 'default',
        animation: active ? 'port-pulse 2s ease-in-out infinite' : 'none',
        opacity: active ? 1 : 0.3,
        position: 'relative',
        color: color,
        transition: 'all 0.2s',
      }}
      title={`${category} ${direction}${!active ? ' (disabled)' : ''}`}
    />
  )
}

// ─── Node card ───────────────────────────────────────────────────────────────
function NodeCard({ node, onPointerDown, onStartWire, onEndWire, onRemove, onConfigChange, onZoom, onRename, wiring, selected, preview, isPreviewing }) {
  const [editingLabel, setEditingLabel] = useState(false)
  const activeFabric = node.activeFabric || {}
  const typeColors = {
    twin: 'rgba(99,102,241,0.3)', analysis: 'rgba(245,158,11,0.3)',
    visualization: 'rgba(16,185,129,0.3)', service: 'rgba(244,114,182,0.3)',
    database: 'rgba(56,189,248,0.3)', transform: 'rgba(251,191,36,0.3)',
  }
  const borderColor = typeColors[node.type] || 'rgba(255,255,255,0.12)'

  // Build port lists per side with multiplicity from fabric streams
  const buildPorts = (direction) => {
    const declared = direction === 'in' ? (node.portsIn || []) : (node.portsOut || [])
    const ports = []
    PORT_CATEGORIES.forEach(cat => {
      const declaredCount = declared.filter(p => p === cat).length
      if (node.type === 'twin') {
        // Twin: ports from fabric streams, filtered by direction
        const allStreams = activeFabric[cat] || []
        // If streams have direction metadata, filter by it; otherwise show all on both sides
        const streams = allStreams.filter(s => {
          if (!s.direction) return true  // no direction = show on both sides
          return s.direction === direction  // "in" streams on left, "out" streams on right
        })
        if (streams.length > 0) {
          // Use original index from allStreams for port ID (so connections map correctly)
          streams.forEach(s => {
            const origIdx = allStreams.indexOf(s)
            ports.push({ cat, idx: origIdx, active: true, label: s.name || `${cat} ${origIdx + 1}`, streamName: s.name })
          })
        }
      } else {
        // Analysis/viz: show declared ports, always active
        if (declaredCount > 0) {
          for (let i = 0; i < declaredCount; i++) {
            ports.push({ cat, idx: i, active: true, label: `${cat}${declaredCount > 1 ? ` ${i + 1}` : ''}`, streamName: null })
          }
        }
        // Don't show categories not declared for analysis/viz
      }
    })
    return ports
  }

  const inPorts = buildPorts('in')
  const outPorts = buildPorts('out')

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute', left: node.x, top: node.y,
        width: 190, minHeight: 70,
        background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${selected ? T.accent : T.glassBorder}`,
        borderTop: `3px solid ${borderColor}`,
        borderRadius: '12px', boxShadow: T.shadow,
        cursor: 'grab', userSelect: 'none', zIndex: selected ? 10 : 1,
        padding: 0,
      }}
    >
      {/* Header */}
      <div style={{ padding: '.5rem .65rem .3rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
        <span style={{ fontSize: '1rem' }}>{node.icon || '⬡'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingLabel ? (
            <input autoFocus value={node.label} style={{ ...inputMini, fontSize: '.78rem', fontWeight: 700, width: '100%' }}
              onChange={e => onRename(e.target.value)}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditingLabel(false) }}
              onPointerDown={e => e.stopPropagation()} />
          ) : (
            <div onDoubleClick={e => { e.stopPropagation(); setEditingLabel(true) }}
              style={{ fontSize: '.78rem', fontWeight: 700, color: T.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}
              title="Double-click to rename">{node.label}</div>
          )}
          <div style={{ fontSize: '.65rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {node.type}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onZoom() }} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '.65rem', padding: '2px',
        }} title="Expand">⛶</button>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '.8rem', padding: '2px',
        }}>×</button>
      </div>

      {/* Ports */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 .5rem .5rem' }}>
        {/* Input ports (left) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
          {inPorts.map((p, i) => (
            <div key={`in-${p.cat}-${p.idx}`} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Port category={p.cat} direction="in" active={p.active}
                onStartWire={() => {}} onEndWire={() => { if (p.active) onEndWire(node.id, `${p.cat}_${p.idx}`, 'in') }} wiring={wiring} />
              <span style={{ fontSize: '.55rem', color: p.active ? PORT_COLORS[p.cat] : T.textMuted, opacity: p.active ? 1 : 0.35, maxWidth: 55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={p.label}>{p.streamName || p.cat.slice(0, 4)}</span>
            </div>
          ))}
        </div>
        {/* Output ports (right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
          {outPorts.map((p, i) => (
            <div key={`out-${p.cat}-${p.idx}`} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span style={{ fontSize: '.55rem', color: p.active ? PORT_COLORS[p.cat] : T.textMuted, opacity: p.active ? 1 : 0.35, maxWidth: 55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={p.label}>{p.streamName || p.cat.slice(0, 4)}</span>
              <Port category={p.cat} direction="out" active={p.active}
                onStartWire={() => { if (p.active) onStartWire(node.id, `${p.cat}_${p.idx}`, 'out') }} onEndWire={() => {}} wiring={wiring} />
            </div>
          ))}
        </div>
      </div>

      {/* Inline config for transform / service / database nodes */}
      {node.type === 'transform' && (() => {
        // Discover fields from preview input data (MQTT payloads)
        const inputData = preview?.data || preview?.output || []
        const skipFields = new Set(['topic', 'time', 'ts', 'measurement', 'tags', 'error', 'field', 'raw_value', 'signal_id'])
        const discoveredFields = {}
        for (const d of (Array.isArray(inputData) ? inputData : []).slice(-10)) {
          if (typeof d !== 'object' || !d) continue
          for (const [k, v] of Object.entries(d)) {
            if (skipFields.has(k) || k.startsWith('_')) continue
            if (!discoveredFields[k]) discoveredFields[k] = new Set()
            if (v !== null && v !== undefined) discoveredFields[k].add(typeof v === 'string' ? v : JSON.stringify(v))
          }
        }
        const fieldNames = Object.keys(discoveredFields)
        const fieldChipStyle = (active) => ({
          ...inputMini, display: 'inline-block', cursor: 'pointer', padding: '1px 5px', borderRadius: '3px', marginRight: '2px', marginBottom: '2px',
          background: active ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.05)',
          border: active ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.08)',
          color: active ? '#fbbf24' : T.textMuted,
        })

        const cfgPanel = { borderTop: '1px solid rgba(251,191,36,0.2)', padding: '.4rem .5rem', fontSize: '.6rem' }

        if (node.toolId === 'transform_text_to_int') {
          const selectedField = node.config?.field || ''
          const fieldValues = selectedField && discoveredFields[selectedField]
            ? [...discoveredFields[selectedField]].filter(v => typeof v === 'string' || v === 'true' || v === 'false')
            : []
          return (
            <div style={cfgPanel} onPointerDown={e => e.stopPropagation()}>
              {/* Field selector */}
              <div style={{ color: T.textMuted, marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                Field {fieldNames.length > 0 ? '' : '(connect + preview to discover)'}
              </div>
              {fieldNames.length > 0 ? (
                <div style={{ marginBottom: '4px' }}>
                  {fieldNames.map(f => (
                    <span key={f} style={fieldChipStyle(selectedField === f)}
                      onClick={() => onConfigChange({ ...node.config, field: f })}>{f}</span>
                  ))}
                </div>
              ) : (
                <input value={selectedField} placeholder='field name' style={{ ...inputMini, width: '100%', marginBottom: '3px' }}
                  onChange={e => onConfigChange({ ...node.config, field: e.target.value })} />
              )}
              {/* Mappings */}
              <div style={{ color: T.textMuted, marginBottom: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Mappings</div>
              {/* Auto-suggest unique values from the selected field */}
              {selectedField && fieldValues.length > 0 && (node.config?.mappings || []).length === 0 && (
                <div style={{ marginBottom: '3px' }}>
                  <span style={{ color: T.textMuted, fontSize: '.55rem' }}>Detected values: </span>
                  <span style={{ color: T.accent, cursor: 'pointer', fontSize: '.55rem' }}
                    onClick={() => {
                      const mc = fieldValues.map((v, i) => ({ text: v, value: i }))
                      onConfigChange({ ...node.config, mappings: mc })
                    }}>auto-fill {fieldValues.length} values</span>
                </div>
              )}
              {(node.config?.mappings || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={m.text} placeholder='text' style={{ ...inputMini, flex: 1 }}
                    onChange={e => { const mc = [...(node.config?.mappings||[])]; mc[i] = { ...mc[i], text: e.target.value }; onConfigChange({ ...node.config, mappings: mc }) }} />
                  <span style={{ color: T.textMuted }}>→</span>
                  <input value={m.value} placeholder='0' type='number' style={{ ...inputMini, width: 32 }}
                    onChange={e => { const mc = [...(node.config?.mappings||[])]; mc[i] = { ...mc[i], value: parseInt(e.target.value)||0 }; onConfigChange({ ...node.config, mappings: mc }) }} />
                  <span style={{ color: 'rgba(255,255,255,0.15)', cursor: 'pointer', fontSize: '.7rem' }}
                    onClick={() => { const mc = (node.config?.mappings||[]).filter((_,j)=>j!==i); onConfigChange({ ...node.config, mappings: mc }) }}>×</span>
                </div>
              ))}
              <span style={{ color: T.accent, cursor: 'pointer', fontSize: '.6rem' }}
                onClick={() => { const mc = [...(node.config?.mappings||[]), { text: '', value: 0 }]; onConfigChange({ ...node.config, mappings: mc }) }}>+ add mapping</span>
            </div>
          )
        }

        if (node.toolId === 'transform_json_extract') {
          const selectedFields = node.config?.fields || (node.config?.path ? [node.config.path] : [])
          return (
            <div style={cfgPanel} onPointerDown={e => e.stopPropagation()}>
              <div style={{ color: T.textMuted, marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                Extract fields {fieldNames.length > 0 ? '' : '(connect + preview)'}
              </div>
              {fieldNames.length > 0 ? (
                <div style={{ marginBottom: '3px' }}>
                  {fieldNames.map(f => {
                    const active = selectedFields.includes(f)
                    return (
                      <span key={f} style={fieldChipStyle(active)}
                        onClick={() => {
                          const newFields = active ? selectedFields.filter(x => x !== f) : [...selectedFields, f]
                          onConfigChange({ ...node.config, fields: newFields, path: newFields.join(',') })
                        }}>{f}
                        {active && discoveredFields[f]?.size > 0 && (
                          <span style={{ opacity: .5, marginLeft: 2 }}>({[...discoveredFields[f]][0]?.toString().slice(0,8)})</span>
                        )}
                      </span>
                    )
                  })}
                </div>
              ) : (
                <input value={node.config?.path || ''} placeholder='field1, field2, ...' style={{ ...inputMini, width: '100%' }}
                  onChange={e => onConfigChange({ ...node.config, path: e.target.value, fields: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })} />
              )}
              {selectedFields.length > 0 && (
                <div style={{ color: T.textMuted, fontSize: '.55rem' }}>
                  Extracting: {selectedFields.join(', ')}
                </div>
              )}
            </div>
          )
        }

        if (node.toolId === 'transform_scale') {
          return (
            <div style={cfgPanel} onPointerDown={e => e.stopPropagation()}>
              {fieldNames.length > 0 && (
                <div style={{ marginBottom: '3px' }}>
                  <span style={{ color: T.textMuted, fontSize: '.55rem' }}>Apply to: </span>
                  {fieldNames.filter(f => {
                    const vals = discoveredFields[f]
                    return vals && [...vals].some(v => !isNaN(parseFloat(v)))
                  }).map(f => (
                    <span key={f} style={fieldChipStyle(node.config?.field === f)}
                      onClick={() => onConfigChange({ ...node.config, field: f })}>{f}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ color: T.textMuted }}>×</span>
                <input value={node.config?.multiply ?? 1} type='number' step='0.1' style={{ ...inputMini, width: 40 }}
                  onChange={e => onConfigChange({ ...node.config, multiply: parseFloat(e.target.value)||1 })} />
                <span style={{ color: T.textMuted }}>+</span>
                <input value={node.config?.offset ?? 0} type='number' step='0.1' style={{ ...inputMini, width: 40 }}
                  onChange={e => onConfigChange({ ...node.config, offset: parseFloat(e.target.value)||0 })} />
              </div>
            </div>
          )
        }

        if (node.toolId === 'transform_filter') {
          return (
            <div style={cfgPanel} onPointerDown={e => e.stopPropagation()}>
              {fieldNames.length > 0 ? (
                <div style={{ marginBottom: '3px' }}>
                  {fieldNames.map(f => (
                    <span key={f} style={fieldChipStyle(node.config?.field === f)}
                      onClick={() => onConfigChange({ ...node.config, field: f })}>{f}</span>
                  ))}
                </div>
              ) : (
                <input value={node.config?.field || 'value'} placeholder='field' style={{ ...inputMini, width: '100%', marginBottom: '3px' }}
                  onChange={e => onConfigChange({ ...node.config, field: e.target.value })} />
              )}
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                <span style={{ color: T.textMuted, fontSize: '.55rem' }}>{node.config?.field || 'value'}</span>
                <select value={node.config?.operator || '>'} style={{ ...inputMini, width: 32 }}
                  onChange={e => onConfigChange({ ...node.config, operator: e.target.value })}>
                  <option value=">">{'>'}</option><option value="<">{'<'}</option><option value="==">{'='}</option><option value="!=">{'≠'}</option>
                </select>
                <input value={node.config?.threshold ?? 0} type='number' style={{ ...inputMini, width: 36 }}
                  onChange={e => onConfigChange({ ...node.config, threshold: parseFloat(e.target.value)||0 })} />
              </div>
            </div>
          )
        }

        return null
      })()}
      {node.type === 'database' && (
        <div style={{ borderTop: '1px solid rgba(56,189,248,0.2)', padding: '.35rem .5rem', fontSize: '.6rem' }}
          onPointerDown={e => e.stopPropagation()}>
          {node.toolId === 'db_sql' && (
            <input value={node.config?.table || ''} placeholder='table name' style={{ ...inputMini, width: '100%' }}
              onChange={e => onConfigChange({ ...node.config, table: e.target.value })} />
          )}
          {node.toolId === 'db_timeseries' && (
            <div style={{ display: 'flex', gap: '3px' }}>
              <input value={node.config?.bucket || ''} placeholder='bucket' style={{ ...inputMini, flex: 1 }}
                onChange={e => onConfigChange({ ...node.config, bucket: e.target.value })} />
              <input value={node.config?.measurement || ''} placeholder='measurement' style={{ ...inputMini, flex: 1 }}
                onChange={e => onConfigChange({ ...node.config, measurement: e.target.value })} />
            </div>
          )}
          {node.toolId === 'db_graph' && (
            <input value={node.config?.label || ''} placeholder='node label' style={{ ...inputMini, width: '100%' }}
              onChange={e => onConfigChange({ ...node.config, label: e.target.value })} />
          )}
        </div>
      )}
      {node.type === 'service' && node.toolId === 'vision_sensor' && (
        <div style={{ borderTop: '1px solid rgba(244,114,182,0.2)', padding: '.4rem .5rem', fontSize: '.6rem' }}
          onPointerDown={e => e.stopPropagation()}>
          {/* Stream type */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '3px', alignItems: 'center' }}>
            <select value={node.config?.stream_type || 'snapshot'} style={{ ...inputMini, flex: 1 }}
              onChange={e => onConfigChange({ ...node.config, stream_type: e.target.value })}>
              <option value="snapshot">HTTP Snapshot</option>
              <option value="mjpeg">MJPEG Stream</option>
              <option value="rtsp">RTSP Stream</option>
              <option value="dash">DASH (.mpd)</option>
              <option value="hls">HLS (.m3u8)</option>
              <option value="youtube">YouTube</option>
              <option value="websocket">WebSocket</option>
            </select>
          </div>
          {/* Stream URL */}
          <input value={node.config?.stream_url || ''} style={{ ...inputMini, width: '100%', marginBottom: '3px' }}
            placeholder={
              node.config?.stream_type === 'rtsp' ? 'rtsp://camera-ip:554/stream' :
              node.config?.stream_type === 'mjpeg' ? 'http://camera-ip/mjpeg' :
              node.config?.stream_type === 'dash' ? 'http://server/stream/manifest.mpd' :
              node.config?.stream_type === 'hls' ? 'http://server/stream/playlist.m3u8' :
              node.config?.stream_type === 'youtube' ? 'https://www.youtube.com/watch?v=VIDEO_ID' :
              node.config?.stream_type === 'websocket' ? 'ws://camera-ip/stream' :
              'http://camera-ip/snapshot.jpg'
            }
            onChange={e => onConfigChange({ ...node.config, stream_url: e.target.value })} />
          {/* Snapshot interval (only for snapshot type) */}
          {node.config?.stream_type === 'snapshot' && (
            <div style={{ marginBottom: '3px' }}>
              <span style={{ color: T.textMuted, fontSize: '.5rem' }}>Poll interval (sec)</span>
              <input value={node.config?.snapshot_interval_sec ?? 5} type='number' min={1} style={{ ...inputMini, width: '100%' }}
                onChange={e => onConfigChange({ ...node.config, snapshot_interval_sec: parseInt(e.target.value) || 5 })} />
            </div>
          )}
          {/* Resolution */}
          <input value={node.config?.resolution || ''} placeholder='Resolution (e.g. 640x480)' style={{ ...inputMini, width: '100%', marginBottom: '3px' }}
            onChange={e => onConfigChange({ ...node.config, resolution: e.target.value })} />
          {/* MQTT metadata topic (optional — for frame metadata, motion events) */}
          <div>
            <span style={{ color: T.textMuted, fontSize: '.5rem' }}>MQTT metadata topic (optional)</span>
            <input value={node.config?.mqtt_meta_topic || ''} placeholder='e.g. camera/lobby/events' style={{ ...inputMini, width: '100%' }}
              onChange={e => onConfigChange({ ...node.config, mqtt_meta_topic: e.target.value })} />
          </div>
        </div>
      )}
      {node.type === 'service' && node.toolId !== 'vision_sensor' && (
        <div style={{ borderTop: `1px solid ${node.toolId === 'sensor' ? 'rgba(244,114,182,0.2)' : 'rgba(251,146,60,0.2)'}`, padding: '.4rem .5rem', fontSize: '.6rem' }}
          onPointerDown={e => e.stopPropagation()}>
          {/* Protocol */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '3px', alignItems: 'center' }}>
            <select value={node.config?.protocol || 'MQTT'} style={{ ...inputMini, width: 60 }}
              onChange={e => onConfigChange({ ...node.config, protocol: e.target.value })}>
              <option value="MQTT">MQTT</option><option value="API">API</option>
            </select>
            {node.config?.protocol === 'MQTT' && (
              <>
                <span style={{ color: T.textMuted }}>QoS</span>
                <select value={node.config?.qos ?? 0} style={{ ...inputMini, width: 30 }}
                  onChange={e => onConfigChange({ ...node.config, qos: parseInt(e.target.value) })}>
                  <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
                </select>
              </>
            )}
          </div>
          {/* Broker (for MQTT) */}
          {node.config?.protocol === 'MQTT' && (
            <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
              <input value={node.config?.broker || ''} placeholder='broker host (blank=local)' style={{ ...inputMini, flex: 1 }}
                onChange={e => onConfigChange({ ...node.config, broker: e.target.value })} />
              <input value={node.config?.port || 1883} type='number' placeholder='port' style={{ ...inputMini, width: 38 }}
                onChange={e => onConfigChange({ ...node.config, port: parseInt(e.target.value) || 1883 })} />
            </div>
          )}
          {/* Topic / endpoint */}
          <input value={node.config?.topic || ''} style={{ ...inputMini, width: '100%', marginBottom: '3px' }}
            placeholder={node.config?.protocol === 'API' ? 'API endpoint URL' : 'MQTT topic'}
            onChange={e => onConfigChange({ ...node.config, topic: e.target.value })} />
          {/* Frequency — only for sensor/actuator, not data_input/data_output */}
          {(node.toolId === 'sensor' || node.toolId === 'actuator') && (
            <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: T.textMuted, fontSize: '.5rem' }}>
                  {node.toolId === 'sensor' ? 'Poll freq (sec)' : 'Publish freq (sec)'}
                </span>
                <input value={node.config?.frequency_sec ?? 5} type='number' min={0} style={{ ...inputMini, width: '100%' }}
                  onChange={e => onConfigChange({ ...node.config, frequency_sec: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          {/* Payload fields */}
          <div>
            <span style={{ color: T.textMuted, fontSize: '.5rem' }}>Payload fields (comma-sep)</span>
            <input value={node.config?.fields || ''} style={{ ...inputMini, width: '100%' }}
              placeholder='e.g. temperature, humidity, status'
              onChange={e => onConfigChange({ ...node.config, fields: e.target.value })} />
          </div>
          {/* API-specific config */}
          {node.config?.protocol === 'API' && (
            <div style={{ marginTop: '3px' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                <select value={node.config?.method || (node.toolId === 'sensor' ? 'GET' : 'POST')} style={{ ...inputMini, width: 45 }}
                  onChange={e => onConfigChange({ ...node.config, method: e.target.value })}>
                  <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
                </select>
                <input value={node.config?.auth_header || ''} placeholder='Auth header' style={{ ...inputMini, flex: 1 }}
                  onChange={e => onConfigChange({ ...node.config, auth_header: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview data panel — show when preview mode is active */}
      {isPreviewing && (() => {
        const p = preview
        const panelStyle = {
          borderTop: '1px solid rgba(99,102,241,0.3)',
          padding: '.5rem', fontSize: '.7rem', color: T.textSecondary,
          background: 'rgba(0,0,0,0.3)', borderRadius: '0 0 12px 12px',
        }

        if (!p) return <div style={panelStyle}><span style={{ color: T.textMuted, fontStyle: 'italic' }}>Waiting for data…</span></div>

        // ── Visualization nodes: rich inline charts ──
        if (p.viz) {
          const pts = p.viz.points || []
          const vals = p.viz.values || []
          const ct = p.viz.chart_type

          if (ct === 'timeseries') {
            const numbers = pts.map(pp => pp.v).filter(v => typeof v === 'number')
            if (numbers.length === 0) return <div style={panelStyle}><span style={{ color: T.textMuted }}>No numeric data</span></div>
            const mn = Math.min(...numbers), mx = Math.max(...numbers), rng = mx - mn || 1
            const W = 160, H = 45
            const step = numbers.length > 1 ? W / (numbers.length - 1) : W / 2
            const pathD = numbers.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${H - ((v - mn) / rng) * (H - 4) - 2}`).join(' ')
            return (
              <div style={panelStyle}>
                <svg width={W} height={H} style={{ display: 'block' }}>
                  {/* Area fill */}
                  <path d={`${pathD} L ${(numbers.length - 1) * step} ${H} L 0 ${H} Z`} fill="rgba(96,165,250,0.15)" />
                  {/* Line */}
                  <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
                  {/* Last point dot */}
                  <circle cx={(numbers.length - 1) * step} cy={H - ((numbers[numbers.length - 1] - mn) / rng) * (H - 4) - 2} r="3" fill="#60a5fa" />
                </svg>
                <div style={{ marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.viz.field_name || 'value'}: <strong style={{ color: '#60a5fa' }}>{numbers[numbers.length - 1]?.toFixed?.(1) ?? numbers[numbers.length - 1]}</strong></span>
                  <span style={{ color: T.textMuted }}>{numbers.length} pts</span>
                </div>
              </div>
            )
          }

          if (ct === 'gauge') {
            const val = p.viz.value ?? 0
            const mn = p.viz.min ?? 0, mx = p.viz.max ?? 100
            const pct = mx !== mn ? ((val - mn) / (mx - mn)) * 100 : 50
            return (
              <div style={panelStyle}>
                <div style={{ textAlign: 'center', marginBottom: 3 }}>
                  <div style={{ fontSize: '.6rem', color: T.textMuted, marginBottom: 1 }}>{p.viz.field_name || 'value'}</div>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#60a5fa' }}>{typeof val === 'number' ? val.toFixed(1) : val}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', background: 'linear-gradient(90deg, #34d399, #60a5fa, #f59e0b)', borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, fontSize: '.6rem', color: T.textMuted }}>
                  <span>{typeof mn === 'number' ? mn.toFixed(1) : mn}</span>
                  <span>{typeof mx === 'number' ? mx.toFixed(1) : mx}</span>
                </div>
              </div>
            )
          }

          if (ct === 'alerts') {
            const alerts = p.viz.alerts || []
            return (
              <div style={panelStyle}>
                {alerts.length === 0 ? <span style={{ color: '#6ee7b7' }}>No alerts</span> : alerts.slice(-4).map((a, i) => (
                  <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#fca5a5', lineHeight: 1.3 }}>
                    <span style={{ opacity: .5, fontSize: '.6rem' }}>{a.time} </span>
                    ⚡ {a.message || a.type || 'alert'}
                  </div>
                ))}
              </div>
            )
          }

          if (ct === 'heatmap' && vals.length > 0) {
            const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1
            return (
              <div style={panelStyle}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                  {vals.map((v, i) => {
                    const t = (v - mn) / rng
                    return <div key={i} style={{ width: 10, height: 10, borderRadius: '2px', background: `rgba(96,165,250,${0.15 + t * 0.85})` }} title={String(v)} />
                  })}
                </div>
                <div style={{ marginTop: 3, color: T.textMuted }}>{vals.length} cells</div>
              </div>
            )
          }

          if (ct === 'status') {
            // Rich status entries with actual data content
            const entries = p.viz.entries || p.viz.statuses?.map(s => ({ text: s })) || []
            return (
              <div style={panelStyle}>
                {entries.length === 0 ? <span style={{ color: T.textMuted }}>No status data</span> : entries.slice(-4).map((e, i) => (
                  <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', lineHeight: 1.3 }}>
                    {e.time && <span style={{ opacity: .4, fontSize: '.55rem', marginRight: 3 }}>{e.time}</span>}
                    <span style={{ color: '#6ee7b7' }}>{e.text || e}</span>
                  </div>
                ))}
              </div>
            )
          }

          if (ct === 'camera') {
            const frameUrl = p.viz.frame_url || p.viz.stream_url || ''
            const streamType = p.viz.stream_type || 'snapshot'
            const ytMatch = frameUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
            const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1` : null
            return (
              <div style={panelStyle}>
                {embedUrl ? (
                  <iframe src={embedUrl} style={{ width: '100%', height: 80, border: 'none', borderRadius: '4px' }} allow="autoplay" />
                ) : frameUrl && (streamType === 'snapshot' || streamType === 'mjpeg') ? (
                  <img src={frameUrl} alt="" style={{ width: '100%', borderRadius: '4px', maxHeight: 80, objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }} />
                ) : frameUrl ? (
                  <span style={{ color: T.textMuted, fontSize: '.55rem' }}>{streamType}: {frameUrl.slice(0, 40)}...</span>
                ) : (
                  <span style={{ color: T.textMuted }}>no source</span>
                )}
              </div>
            )
          }

          return <div style={panelStyle}><span style={{ color: T.textMuted }}>{p.viz.chart_type}: {JSON.stringify(p.viz.summary || {}).slice(0, 80)}</span></div>
        }

        // ── Analysis & twin nodes: summary stats ──
        if (p.summary) {
          const entries = Object.entries(p.summary).filter(([k]) => k !== 'type' && k !== 'latest')
          return (
            <div style={panelStyle}>
              {entries.length === 0 ? <span style={{ color: T.textMuted }}>Processing…</span> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                  {entries.map(([k, v]) => (
                    <div key={k}>
                      <span style={{ color: T.textMuted }}>{k}: </span>
                      <strong style={{ color: typeof v === 'boolean' ? (v ? '#fca5a5' : '#6ee7b7') : '#60a5fa' }}>
                        {v == null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : typeof v === 'object' ? '...' : String(v)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        }

        return <div style={panelStyle}><span style={{ color: T.textMuted }}>No data</span></div>
      })()}
    </div>
  )
}

// ─── SVG Wire ────────────────────────────────────────────────────────────────
function Wire({ x1, y1, x2, y2, category, label, onClick, onLabelChange }) {
  const color = PORT_COLORS[category] || '#888'
  const dx = Math.abs(x2 - x1) * 0.5
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const [editing, setEditing] = React.useState(false)
  return (
    <g>
      <path d={d} stroke={color} strokeWidth={2.5} fill="none" opacity={0.6}
        strokeDasharray="6,4" style={{ animation: 'wire-flow 1s linear infinite' }} />
      <path d={d} stroke={color} strokeWidth={8} fill="none" opacity={0}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        onClick={onClick} />
      {editing && onLabelChange ? (
        <foreignObject x={mx - 40} y={my - 10} width={80} height={20} style={{ pointerEvents: 'auto' }}>
          <input autoFocus value={label || ''} style={{
            background: 'rgba(0,0,0,0.7)', border: `1px solid ${color}`, borderRadius: '3px',
            color: '#f0f4f8', fontSize: '.55rem', padding: '1px 4px', width: '100%', outline: 'none', textAlign: 'center',
          }}
            onChange={e => onLabelChange(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false) }} />
        </foreignObject>
      ) : onLabelChange ? (
        <text x={mx} y={my - 4} textAnchor="middle" fill={label ? color : 'rgba(255,255,255,0.12)'}
          fontSize={label ? 9 : 8} style={{ pointerEvents: 'auto', cursor: 'text' }}
          onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}>
          {label || '+'}
        </text>
      ) : null}
    </g>
  )
}

// ─── Library panel item ──────────────────────────────────────────────────────
function LibraryItem({ icon, name, subtitle, borderColor, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        background: T.glassBg, border: `1px solid ${T.glassBorder}`,
        borderLeft: `3px solid ${borderColor || T.glassBorder}`,
        borderRadius: '8px', padding: '.4rem .6rem',
        cursor: 'grab', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: '.4rem',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '.9rem', opacity: .7 }}>{icon}</span>
      <div>
        <div style={{ color: T.textPrimary, fontWeight: 600 }}>{name}</div>
        {subtitle && <div style={{ fontSize: '.65rem', color: T.textMuted }}>{subtitle}</div>}
      </div>
    </div>
  )
}

// ─── Main Canvas ─────────────────────────────────────────────────────────────
export default function SynthesisCanvas({ twins, fabricData, authFetch, apiBase, onRefresh }) {
  const [nodes, setNodes] = useState([])
  const [connections, setConnections] = useState([])
  const [dragging, setDragging] = useState(null)
  const [wiring, setWiring] = useState(null) // { fromNodeId, fromPort, fromDir }
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState(null)
  const [locked, setLocked] = useState(false)
  const [synthName, setSynthName] = useState('')
  const [buildStatus, setBuildStatus] = useState(null) // null | { id, status, build_log }
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState({}) // nodeId -> { summary, output, viz, ... }
  const [synthId, setSynthId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [zoomedNode, setZoomedNode] = useState(null) // node id or null
  const canvasRef = useRef(null)

  // Load last saved synthesis on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${apiBase}/api/synthesis/`)
        if (!res.ok) return
        const list = await res.json()
        if (list.length > 0) {
          const latest = list[0] // sorted by updated_at desc
          const detail = await authFetch(`${apiBase}/api/synthesis/${latest.id}/`)
          if (!detail.ok) return
          const d = await detail.json()
          if (d.canvas_state?.nodes?.length > 0 && d.status === 'draft') {
            setNodes(d.canvas_state.nodes || [])
            setConnections(d.canvas_state.connections || [])
            setSynthName(d.name || '')
            setSynthId(d.id)
            setLastSaved(new Date().toLocaleTimeString())
          }
        }
      } catch { /* ignore */ }
    })()
  }, [])

  // Save synthesis
  const handleSave = async () => {
    if (!synthName.trim()) { alert('Name your synthesis first'); return }
    setSaving(true)
    const canvas_state = { nodes, connections }
    try {
      if (synthId) {
        // Update existing
        await authFetch(`${apiBase}/api/synthesis/${synthId}/`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: synthName, canvas_state }),
        })
      } else {
        // Create new
        const res = await authFetch(`${apiBase}/api/synthesis/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: synthName, canvas_state }),
        })
        if (res.ok) {
          const d = await res.json()
          setSynthId(d.id)
        }
      }
      setLastSaved(new Date().toLocaleTimeString())
    } catch { /* ignore */ }
    setSaving(false)
  }

  // Clear canvas
  const handleClear = () => {
    if (nodes.length > 0 && !confirm('Clear the entire canvas?')) return
    setNodes([])
    setConnections([])
    setSelectedNode(null)
    setPreviewing(false)
    setPreviewData({})
    setBuildStatus(null)
    setLocked(false)
    setSynthId(null)
    setSynthName('')
    setLastSaved(null)
  }

  // Load built process models for the process library
  const [builtProcesses, setBuiltProcesses] = useState([])
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${apiBase}/api/process/built`)
        if (res.ok) setBuiltProcesses(await res.json())
      } catch {}
    })()
  }, [])

  // Helper: extract category from port ID like "data_0" -> "data"
  const portCategory = (portId) => portId.replace(/_\d+$/, '')

  // Build port list for a node (same logic as NodeCard) for position calc
  const getNodePorts = useCallback((node, direction) => {
    const declared = direction === 'in' ? (node.portsIn || []) : (node.portsOut || [])
    const fabric = node.activeFabric || {}
    const ports = []
    PORT_CATEGORIES.forEach(cat => {
      if (node.type === 'twin') {
        const allStreams = fabric[cat] || []
        const streams = allStreams.filter(s => !s.direction || s.direction === direction)
        if (streams.length > 0) {
          streams.forEach(s => {
            const origIdx = allStreams.indexOf(s)
            ports.push({ id: `${cat}_${origIdx}`, cat })
          })
        }
      } else {
        const count = declared.filter(p => p === cat).length
        for (let i = 0; i < count; i++) ports.push({ id: `${cat}_${i}`, cat })
      }
    })
    return ports
  }, [])

  // Get port position for a node by port ID
  const getPortPos = useCallback((nodeId, portId, direction) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return { x: 0, y: 0 }
    const ports = getNodePorts(node, direction)
    const idx = ports.findIndex(p => p.id === portId)
    const row = idx >= 0 ? idx : 0
    const yOff = 50 + row * 17
    if (direction === 'out') return { x: node.x + 190, y: node.y + yOff }
    return { x: node.x, y: node.y + yOff }
  }, [nodes, getNodePorts])

  // Pointer events for dragging nodes
  const handlePointerDown = (e, nodeId) => {
    if (locked) return
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setSelectedNode(nodeId)
    const rect = canvasRef.current.getBoundingClientRect()
    setDragging({ nodeId, offsetX: e.clientX - rect.left - node.x, offsetY: e.clientY - rect.top - node.y })
  }

  const handlePointerMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setMousePos({ x: mx, y: my })

    if (dragging) {
      setNodes(prev => prev.map(n =>
        n.id === dragging.nodeId
          ? { ...n, x: Math.max(0, mx - dragging.offsetX), y: Math.max(0, my - dragging.offsetY) }
          : n
      ))
    }
  }

  const handlePointerUp = () => {
    setDragging(null)
    if (wiring) setWiring(null) // cancel wiring if released on empty space
  }

  // Start/end wiring — portId is like "data_0", "state_1", etc.
  const startWire = (nodeId, portId, direction) => {
    if (locked) return
    setWiring({ fromNodeId: nodeId, fromPort: portId, fromDir: direction })
  }

  const endWire = (nodeId, portId, direction) => {
    if (!wiring || locked) return
    if (wiring.fromNodeId === nodeId) { setWiring(null); return }
    if (wiring.fromDir === direction) { setWiring(null); return }
    // Category must match (e.g., data_0 matches data_1)
    const fromCat = portCategory(wiring.fromPort)
    const toCat = portCategory(portId)
    if (fromCat !== toCat) { setWiring(null); return }
    // No duplicate
    const exists = connections.some(c =>
      c.fromNodeId === wiring.fromNodeId && c.fromPort === wiring.fromPort &&
      c.toNodeId === nodeId && c.toPort === portId
    )
    if (exists) { setWiring(null); return }
    setConnections(prev => [...prev, {
      id: newId(), fromNodeId: wiring.fromNodeId, fromPort: wiring.fromPort,
      toNodeId: nodeId, toPort: portId,
    }])
    setWiring(null)
  }

  const removeConnection = (connId) => {
    if (locked) return
    setConnections(prev => prev.filter(c => c.id !== connId))
  }

  const removeNode = (nodeId) => {
    if (locked) return
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId))
    if (selectedNode === nodeId) setSelectedNode(null)
  }

  // Drop handler for library items
  const handleDrop = (e) => {
    e.preventDefault()
    if (locked) return
    const data = e.dataTransfer.getData('application/json')
    if (!data) return
    const item = JSON.parse(data)
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - 90
    const y = e.clientY - rect.top - 40
    const node = { ...item, id: newId(), x: Math.max(0, x), y: Math.max(0, y) }
    setNodes(prev => [...prev, node])
  }

  // Lock & build
  const handleLock = async () => {
    if (!synthName.trim()) { alert('Please name your synthesis'); return }
    setLocked(true)
    const canvas_state = { nodes, connections }
    try {
      const res = await authFetch(`${apiBase}/api/synthesis/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: synthName, canvas_state }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error); setLocked(false); return }
      // Lock it
      await authFetch(`${apiBase}/api/synthesis/${d.id}/lock`, { method: 'POST' })
      // Build it
      const buildRes = await authFetch(`${apiBase}/api/synthesis/${d.id}/build`, { method: 'POST' })
      const bd = await buildRes.json()
      setBuildStatus({ id: d.id, status: 'building' })
    } catch (err) {
      alert('Error: ' + err.message)
      setLocked(false)
    }
  }

  // Poll build status
  useEffect(() => {
    if (!buildStatus?.id || (buildStatus.status !== 'building')) return
    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`${apiBase}/api/synthesis/${buildStatus.id}/status`)
        const d = await res.json()
        setBuildStatus(prev => ({ ...prev, ...d }))
        if (d.status === 'ready' || d.status === 'failed') clearInterval(interval)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [buildStatus?.id, buildStatus?.status])

  // Preview polling — fetch live data every 4 seconds while preview is active
  useEffect(() => {
    if (!previewing || nodes.length === 0 || connections.length === 0) {
      if (!previewing) setPreviewData({})
      return
    }
    let active = true
    const fetchPreview = async () => {
      try {
        const res = await authFetch(`${apiBase}/api/synthesis/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes, connections }),
        })
        if (res.ok && active) {
          const d = await res.json()
          setPreviewData(d.node_data || {})
        }
      } catch { /* ignore */ }
    }
    fetchPreview()
    const interval = setInterval(fetchPreview, 4000)
    return () => { active = false; clearInterval(interval) }
  }, [previewing, nodes.length, connections.length])

  // Build twin fabric map for port activation
  const getFabricForTwin = (twinId) => {
    // Try fabric endpoint data first
    if (fabricData?.twins) {
      const tw = fabricData.twins.find(t => t.twin_id === twinId)
      if (tw?.fabric && Object.values(tw.fabric).some(v => v.length > 0)) return tw.fabric
    }
    // Fallback: read directly from the twin's interfaces.fabric
    const rawTwin = (twins || []).find(t => t.twin_id === twinId)
    if (rawTwin?.interfaces?.fabric) return rawTwin.interfaces.fabric
    // Last resort: infer from data_streams
    const streams = rawTwin?.interfaces?.data_streams || []
    if (streams.length > 0) {
      return { data: streams.map(s => ({ name: s, protocol: s.startsWith('MQTT:') ? 'MQTT' : 'API', trigger: 'event' })) }
    }
    return {}
  }

  const glass = { background: T.glassBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${T.glassBorder}`, borderRadius: '12px', boxShadow: T.shadow }

  return (
    <div style={{ display: 'flex', gap: '.75rem', height: 'calc(100vh - 160px)' }}>
      {/* ── Left: Library panels ────────────────────────────────────── */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '.5rem', overflow: 'auto' }}>
        <CollapsiblePanel title="DT Library" color="#818cf8">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {(twins || []).filter(tw => {
              const domain = (tw.metadata || {}).domain || []
              return !domain.includes('Process') && !domain.includes('Composite')
            }).map(tw => {
              const twinId = tw.twin_id, md = tw.metadata || {}, name = md.name || twinId
              const fabric = getFabricForTwin(twinId)
              const streamCount = Object.values(fabric).reduce((s, arr) => s + arr.length, 0)
              return <LibraryItem key={twinId} icon="⬡" name={name}
                subtitle={`${twinId}${streamCount ? ` · ${streamCount} streams` : ''}`} borderColor="#818cf8"
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'twin', twinId, label: name, icon: '⬡', portsIn: [], portsOut: [], activeFabric: fabric,
                }))} />
            })}
            {(!twins || twins.length === 0) && <div style={{ fontSize: '.72rem', color: T.textMuted }}>No twins</div>}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Analysis" color="#f59e0b">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {ANALYSIS_TOOLS.map(tool => (
              <LibraryItem key={tool.id} icon={tool.icon} name={tool.name} borderColor="#f59e0b"
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'analysis', toolId: tool.id, label: tool.name, icon: tool.icon,
                  portsIn: tool.portsIn, portsOut: tool.portsOut, config: tool.config, activeFabric: {},
                }))} />
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Visualization" color="#34d399">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {VIZ_TOOLS.map(tool => (
              <LibraryItem key={tool.id} icon={tool.icon} name={tool.name} borderColor="#34d399"
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'visualization', toolId: tool.id, label: tool.name, icon: tool.icon,
                  portsIn: tool.portsIn, portsOut: tool.portsOut || [], config: {}, activeFabric: {},
                }))} />
            ))}
          </div>
        </CollapsiblePanel>
      </div>

      {/* ── Right: Canvas + controls ───────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {/* Controls bar */}
        <div style={{ ...glass, padding: '.6rem 1rem', display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
          <input value={synthName} onChange={e => setSynthName(e.target.value)} disabled={locked}
            placeholder="Synthesis name..." style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px', color: T.textPrimary, padding: '.35rem .6rem', fontSize: '.85rem', flex: 1, minWidth: 150, outline: 'none',
            }} />
          <span style={{ fontSize: '.72rem', color: T.textMuted }}>{nodes.length} nodes · {connections.length} wires{lastSaved ? ` · saved ${lastSaved}` : ''}</span>
          {!locked && (
            <button onClick={handleSave} disabled={saving || nodes.length === 0} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.13)',
              borderRadius: '6px', color: saving ? T.textMuted : T.textSecondary,
              padding: '.3rem .7rem', cursor: 'pointer', fontSize: '.78rem',
              opacity: nodes.length === 0 ? 0.4 : 1,
            }}>{saving ? 'Saving...' : 'Save'}</button>
          )}
          <button onClick={handleClear} style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '6px', color: '#fca5a5', padding: '.3rem .7rem', cursor: 'pointer', fontSize: '.78rem',
          }}>Clear</button>
          {!locked && !buildStatus && connections.length > 0 && (
            <button onClick={() => setPreviewing(p => !p)} style={{
              background: previewing ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${previewing ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.13)'}`,
              borderRadius: '8px', color: previewing ? '#6ee7b7' : T.textSecondary,
              padding: '.35rem .8rem', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
            }}>{previewing ? '■ Stop Preview' : '▶ Preview'}</button>
          )}
          {!locked && !buildStatus && (
            <button onClick={handleLock} disabled={nodes.length === 0} style={{
              background: T.accentBg, border: `1px solid ${T.accentBorder}`, borderRadius: '8px',
              color: '#fff', padding: '.35rem 1rem', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
              opacity: nodes.length === 0 ? 0.4 : 1,
            }}>Lock & Build</button>
          )}
          {buildStatus && (
            <span style={{
              fontSize: '.82rem', fontWeight: 600,
              color: buildStatus.status === 'ready' ? '#6ee7b7' : buildStatus.status === 'failed' ? '#fca5a5' : T.accent,
            }}>
              {buildStatus.status === 'building' ? 'Building...' : buildStatus.status === 'ready' ? 'Built & Running' : 'Build Failed'}
            </span>
          )}
          {buildStatus?.status === 'ready' && (
            <a href={`${apiBase}/api/synthesis/${buildStatus.id}/download`} style={{
              background: 'rgba(16,185,129,0.3)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px',
              color: '#6ee7b7', padding: '.3rem .7rem', fontSize: '.78rem', textDecoration: 'none', fontWeight: 600,
            }}>Download Package</a>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{
            ...glass, flex: 1, position: 'relative', overflow: 'hidden',
            background: 'rgba(0,0,0,0.15)', borderRadius: '16px',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {/* Grid hint when empty */}
          {nodes.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: T.textMuted, fontSize: '.9rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '.5rem', opacity: .3 }}>⬡</div>
                Drag twins, analysis tools, or visualizations here
              </div>
            </div>
          )}

          {/* SVG wires overlay */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            {connections.map(conn => {
              const from = getPortPos(conn.fromNodeId, conn.fromPort, 'out')
              const to = getPortPos(conn.toNodeId, conn.toPort, 'in')
              return <Wire key={conn.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} category={portCategory(conn.fromPort)}
                label={conn.label || ''} onClick={() => removeConnection(conn.id)}
                onLabelChange={lbl => setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, label: lbl } : c))} />
            })}
            {/* Active wiring line */}
            {wiring && (() => {
              const from = getPortPos(wiring.fromNodeId, wiring.fromPort, 'out')
              return <Wire x1={from.x} y1={from.y} x2={mousePos.x} y2={mousePos.y} category={portCategory(wiring.fromPort)} onClick={() => {}} />
            })()}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              selected={selectedNode === node.id}
              onPointerDown={e => handlePointerDown(e, node.id)}
              onStartWire={startWire}
              onEndWire={endWire}
              onRemove={() => removeNode(node.id)}
              onConfigChange={(newConfig) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, config: newConfig } : n))}
              onZoom={() => setZoomedNode(node.id)}
              onRename={name => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, label: name } : n))}
              wiring={wiring}
              preview={previewing ? previewData[node.id] : null}
              isPreviewing={previewing}
            />
          ))}
        </div>

        {/* Build log */}
        {buildStatus?.build_log && (
          <details open={buildStatus.status === 'failed'}>
            <summary style={{ cursor: 'pointer', fontSize: '.82rem', color: T.accent, fontWeight: 600 }}>Build Log</summary>
            <pre style={{
              background: 'rgba(0,0,0,0.4)', padding: '.75rem', borderRadius: '8px', marginTop: '.4rem',
              fontSize: '.72rem', color: '#94a3b8', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
            }}>{buildStatus.build_log}</pre>
          </details>
        )}
      </div>

      {/* ── Right: Services, Databases, Transforms, Processes ──────── */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '.4rem', overflow: 'auto' }}>

        <CollapsiblePanel title="Services" color="#f472b6">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {SERVICE_TOOLS.map(tool => (
              <LibraryItem key={tool.id} icon={tool.icon} name={tool.name}
                subtitle={tool.subtype === 'sensor' || tool.subtype === 'vision' || tool.subtype === 'data_input' ? 'Input' : 'Output'}
                borderColor={tool.subtype === 'sensor' || tool.subtype === 'vision' || tool.subtype === 'data_input' ? '#f472b6' : '#fb923c'}
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'service', toolId: tool.id, label: tool.name, icon: tool.icon,
                  portsIn: tool.portsIn, portsOut: tool.portsOut,
                  config: JSON.parse(JSON.stringify(tool.config)), activeFabric: {},
                }))} />
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Databases" color="#38bdf8">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {DATABASE_TOOLS.map(tool => (
              <LibraryItem key={tool.id} icon={tool.icon} name={tool.name}
                subtitle={tool.subtype === 'sql' ? 'Relational' : tool.subtype === 'timeseries' ? 'Time Series' : 'Graph'}
                borderColor="#38bdf8"
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'database', toolId: tool.id, label: tool.name, icon: tool.icon,
                  portsIn: tool.portsIn, portsOut: tool.portsOut,
                  config: { ...tool.config }, activeFabric: {},
                }))} />
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Transforms" color="#fbbf24">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {TRANSFORM_TOOLS.map(tool => (
              <LibraryItem key={tool.id} icon={tool.icon} name={tool.name} borderColor="#fbbf24"
                onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                  type: 'transform', toolId: tool.id, label: tool.name, icon: tool.icon,
                  portsIn: tool.portsIn, portsOut: tool.portsOut,
                  config: JSON.parse(JSON.stringify(tool.config)), activeFabric: {},
                }))} />
            ))}
          </div>
        </CollapsiblePanel>

        <CollapsiblePanel title="Process Library" color="#f472b6">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
              {builtProcesses.map(proc => {
                const twinFabric = getFabricForTwin(proc.twin_id)
                const hasRealFabric = Object.values(twinFabric).some(v => v?.length > 0)
                const fabric = hasRealFabric ? twinFabric : {
                  data: [{ name: `${proc.name} output`, protocol: 'internal', trigger: 'event' }],
                  state: [{ name: `state:${proc.name}`, protocol: 'internal', trigger: 'event' }],
                }
                const portCount = Object.values(fabric).reduce((s, arr) => s + (arr?.length || 0), 0)
                return <LibraryItem key={proc.id} icon="⚙" name={proc.name}
                  subtitle={`${portCount} ports · tp: ${proc.sim_summary?.throughput || '?'}/t`}
                  borderColor="#f472b6"
                  onDragStart={e => e.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'twin', twinId: proc.twin_id, label: proc.name, icon: '⚙',
                    portsIn: [], portsOut: [], activeFabric: fabric,
                  }))} />
              })}
              {builtProcesses.length === 0 && <div style={{ fontSize: '.72rem', color: T.textMuted }}>No built processes yet</div>}
            </div>
          </CollapsiblePanel>
      </div>

      {/* ── Zoomed card modal ────────────────────────────────────── */}
      {zoomedNode && (() => {
        const node = nodes.find(n => n.id === zoomedNode)
        if (!node) return null
        const pd = previewing ? previewData[zoomedNode] : null
        return (
          <div onClick={() => setZoomedNode(null)} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'rgba(15,12,41,0.95)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
              border: `1px solid ${T.glassBorder}`, borderRadius: '16px', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              width: '90vw', maxWidth: 700, maxHeight: '85vh', overflow: 'auto', padding: '1.5rem',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{node.icon || '⬡'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: T.textPrimary }}>{node.label}</div>
                  <div style={{ fontSize: '.8rem', color: T.textMuted, textTransform: 'uppercase' }}>{node.type}{node.toolId ? ` · ${node.toolId}` : ''}{node.twinId ? ` · ${node.twinId}` : ''}</div>
                </div>
                <button onClick={() => setZoomedNode(null)} style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px', color: T.textSecondary, padding: '.4rem .8rem', cursor: 'pointer', fontSize: '.85rem',
                }}>Close</button>
              </div>

              {/* Config */}
              {node.config && typeof node.config === 'object' && Object.keys(node.config).length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '.75rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>Configuration</div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '.75rem', fontSize: '.82rem' }}>
                    {Object.entries(node.config).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: '.5rem', padding: '.2rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ color: T.textMuted, minWidth: 100 }}>{k}</span>
                        <span style={{ color: T.textPrimary, wordBreak: 'break-all' }}>
                          {v == null ? '–' : Array.isArray(v) ? v.map((item, i) => (
                            <span key={i} style={{ display: 'inline-block', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '1px 6px', margin: '1px', fontSize: '.78rem' }}>
                              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                            </span>
                          )) : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fabric / Ports */}
              {node.activeFabric && typeof node.activeFabric === 'object' && Object.values(node.activeFabric).some(v => Array.isArray(v) && v.length > 0) && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '.75rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>Data Streams</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                    {PORT_CATEGORIES.map(cat => (node.activeFabric[cat] || []).map((s, i) => (
                      <span key={`${cat}-${i}`} style={{
                        padding: '.25rem .6rem', borderRadius: '6px', fontSize: '.78rem',
                        background: `${PORT_COLORS[cat]}18`, border: `1px solid ${PORT_COLORS[cat]}40`, color: PORT_COLORS[cat],
                      }}>{s.name || cat}</span>
                    )))}
                  </div>
                </div>
              )}

              {/* Process diagram for process twins */}
              {node.type === 'twin' && node.activeFabric && (() => {
                // Check if this is a process twin by looking for process_id in metadata
                const regTwin = (twins || []).find(t => t.twin_id === node.twinId)
                const processId = regTwin?.metadata?.process_id
                if (!processId) return null
                return (
                  <ProcessDiagramEmbed processId={processId} authFetch={authFetch} apiBase={apiBase} />
                )
              })()}

              {/* Camera frame preview */}
              {node.toolId === 'vision_sensor' && node.config?.stream_url && (() => {
                const url = node.config.stream_url
                const st = node.config.stream_type || 'snapshot'
                const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
                const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1` : null
                return (
                  <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '.75rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>Camera Feed ({st})</div>
                    {embedUrl ? (
                      <iframe src={embedUrl} style={{ width: '100%', height: 350, border: 'none', borderRadius: '8px' }} allow="autoplay; fullscreen" allowFullScreen />
                    ) : (st === 'snapshot' || st === 'mjpeg') ? (
                      <img src={url} alt="camera" style={{
                        maxWidth: '100%', maxHeight: 300, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                      }} onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                      <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', color: T.textMuted }}>
                        {st} stream configured: {url}
                      </div>
                    )}
                    <div style={{ fontSize: '.72rem', color: T.textMuted, marginTop: '.3rem' }}>{url}</div>
                  </div>
                )
              })()}

              {/* Preview data */}
              {pd && (
                <div>
                  <div style={{ fontSize: '.75rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                    Live Data {pd.source ? `(${pd.source})` : ''} · {pd.data?.length || pd.output?.length || 0} points
                  </div>

                  {/* Viz: timeseries */}
                  {pd.viz?.chart_type === 'timeseries' && pd.viz.points?.length > 0 && (() => {
                    const numbers = pd.viz.points.map(p => p.v).filter(v => typeof v === 'number')
                    if (!numbers.length) return null
                    const mn = Math.min(...numbers), mx = Math.max(...numbers), rng = mx - mn || 1
                    const W = 620, H = 120, step = numbers.length > 1 ? W / (numbers.length - 1) : W / 2
                    const pathD = numbers.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${H - ((v - mn) / rng) * (H - 8) - 4}`).join(' ')
                    return (
                      <div style={{ marginBottom: '1rem' }}>
                        <svg width={W} height={H} style={{ display: 'block', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                          <path d={`${pathD} L ${(numbers.length - 1) * step} ${H} L 0 ${H} Z`} fill="rgba(96,165,250,0.1)" />
                          <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="2" />
                          <circle cx={(numbers.length - 1) * step} cy={H - ((numbers[numbers.length - 1] - mn) / rng) * (H - 8) - 4} r="4" fill="#60a5fa" />
                        </svg>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.3rem', fontSize: '.78rem', color: T.textMuted }}>
                          <span>{pd.viz.field_name || 'value'}: <strong style={{ color: '#60a5fa' }}>{numbers[numbers.length - 1]?.toFixed?.(2)}</strong></span>
                          <span>min: {mn.toFixed(2)} · max: {mx.toFixed(2)} · {numbers.length} pts</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Viz: gauge */}
                  {pd.viz?.chart_type === 'gauge' && (
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '.8rem', color: T.textMuted }}>{pd.viz.field_name || 'value'}</div>
                      <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#60a5fa' }}>{typeof pd.viz.value === 'number' ? pd.viz.value.toFixed(2) : pd.viz.value}</div>
                      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, margin: '.5rem 4rem', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(2, ((pd.viz.value - (pd.viz.min || 0)) / ((pd.viz.max || 100) - (pd.viz.min || 0))) * 100))}%`, height: '100%', background: 'linear-gradient(90deg, #34d399, #60a5fa, #f59e0b)', borderRadius: 5 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 4rem', fontSize: '.78rem', color: T.textMuted }}>
                        <span>{pd.viz.min}</span><span>{pd.viz.max}</span>
                      </div>
                    </div>
                  )}

                  {/* Viz: status */}
                  {pd.viz?.chart_type === 'status' && (pd.viz.entries || []).map((e, i) => (
                    <div key={i} style={{ padding: '.4rem .6rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '.85rem' }}>
                      {e.time && <span style={{ color: T.textMuted, marginRight: '.5rem', fontSize: '.75rem' }}>{e.time}</span>}
                      <span style={{ color: '#6ee7b7' }}>{e.text}</span>
                    </div>
                  ))}

                  {/* Viz: alerts */}
                  {pd.viz?.chart_type === 'alerts' && (pd.viz.alerts || []).map((a, i) => (
                    <div key={i} style={{ padding: '.4rem .6rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '.85rem', color: '#fca5a5' }}>
                      <span style={{ color: T.textMuted, marginRight: '.5rem', fontSize: '.75rem' }}>{a.time}</span>
                      ⚡ {a.message}
                    </div>
                  ))}

                  {/* Viz: camera */}
                  {pd.viz?.chart_type === 'camera' && pd.viz.frame_url && (() => {
                    const url = pd.viz.frame_url
                    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
                    const embedUrl = ytMatch ? `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1` : null
                    return (
                      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        {embedUrl ? (
                          <iframe src={embedUrl} style={{ width: '100%', height: 350, border: 'none', borderRadius: '8px' }} allow="autoplay; fullscreen" allowFullScreen />
                        ) : (pd.viz.stream_type === 'snapshot' || pd.viz.stream_type === 'mjpeg') ? (
                          <img src={url} alt="camera" style={{
                            maxWidth: '100%', maxHeight: 400, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                          }} onError={e => { e.target.style.display = 'none' }} />
                        ) : (
                          <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', color: T.textMuted }}>
                            {pd.viz.stream_type} stream — use a player for: {url}
                          </div>
                        )}
                        <div style={{ fontSize: '.72rem', color: T.textMuted, marginTop: '.3rem' }}>
                          {pd.viz.stream_type || 'snapshot'} · {url}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Data table for non-viz nodes */}
                  {!pd.viz && (pd.data?.length > 0 || pd.output?.length > 0) && (() => {
                    const rows = (pd.data || pd.output || []).filter(r => r && typeof r === 'object')
                    if (!rows.length) return null
                    const cols = Object.keys(rows[0]).filter(k => !k.startsWith('_') && k !== 'topic').slice(0, 8)
                    return (
                    <div style={{ maxHeight: 300, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                        <thead>
                          <tr>
                            {cols.map(k => (
                                <th key={k} style={{ textAlign: 'left', padding: '.3rem .4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: T.textMuted, fontWeight: 600, fontSize: '.7rem', textTransform: 'uppercase' }}>{k}</th>
                              ))
                            })()}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(-20).map((row, ri) => (
                            <tr key={ri}>
                              {cols.map(k => {
                                let v = row[k]
                                if (typeof v === 'number' && !Number.isInteger(v)) v = v.toFixed(3)
                                if (typeof v === 'boolean') v = v ? 'true' : 'false'
                                if (v != null && typeof v === 'object') v = JSON.stringify(v).slice(0, 40)
                                return <td key={k} style={{ padding: '.25rem .4rem', borderBottom: '1px solid rgba(255,255,255,0.03)', color: T.textPrimary }}>{String(v ?? '')}</td>
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )})()}

                  {/* Summary */}
                  {pd.summary && !pd.viz && (
                    <div style={{ marginTop: '.75rem', display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                      {Object.entries(pd.summary).filter(([k]) => k !== 'type').map(([k, v]) => (
                        <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '.3rem .6rem', fontSize: '.78rem' }}>
                          <span style={{ color: T.textMuted }}>{k}: </span>
                          <strong style={{ color: '#60a5fa' }}>
                            {v == null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : typeof v === 'object' ? '...' : String(v)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!pd && previewing && <div style={{ color: T.textMuted, fontStyle: 'italic', marginTop: '1rem' }}>Waiting for preview data...</div>}
              {!previewing && <div style={{ color: T.textMuted, fontSize: '.85rem', marginTop: '1rem' }}>Start Preview to see live data</div>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
