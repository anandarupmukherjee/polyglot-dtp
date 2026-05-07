import React, { useEffect, useState, useRef } from 'react'
import SynthesisCanvas from './SynthesisCanvas'
import ProcessCanvas from './ProcessCanvas'

const apiBase = import.meta.env.VITE_API_BASE || ''
const weavexUrl = import.meta.env.VITE_WEAVEX_URL || 'http://localhost:8090'
const tokenKey = 'dtp_token'
const refreshKey = 'dtp_refresh'

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  textPrimary:   '#f0f4f8',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted:     'rgba(255,255,255,0.35)',
  accent:        '#818cf8',      // indigo-400
  accentBg:      'rgba(99,102,241,0.55)',
  accentBorder:  'rgba(99,102,241,0.45)',
  glassBg:       'rgba(255,255,255,0.07)',
  glassBorder:   'rgba(255,255,255,0.12)',
  glassHover:    'rgba(255,255,255,0.11)',
  shadow:        '0 8px 32px rgba(0,0,0,0.35)',
  shadowSm:      '0 4px 16px rgba(0,0,0,0.25)',
}

const glass = {
  background:            T.glassBg,
  backdropFilter:        'blur(24px)',
  WebkitBackdropFilter:  'blur(24px)',
  border:                `1px solid ${T.glassBorder}`,
  borderRadius:          '16px',
  boxShadow:             T.shadow,
}

const glassCard = {
  ...glass,
  padding: '1.25rem 1.5rem',
  margin: '.75rem 0',
}

const glassInput = {
  background:   'rgba(255,255,255,0.08)',
  border:       '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  color:        T.textPrimary,
  padding:      '.5rem .8rem',
  outline:      'none',
  fontSize:     '.9rem',
  width:        '100%',
}

const glassBtn = {
  background:           T.accentBg,
  backdropFilter:       'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border:               `1px solid ${T.accentBorder}`,
  borderRadius:         '8px',
  color:                '#fff',
  padding:              '.45rem 1.1rem',
  cursor:               'pointer',
  fontWeight:           500,
  fontSize:             '.875rem',
  letterSpacing:        '.01em',
}

const ghostBtn = {
  background:   'rgba(255,255,255,0.07)',
  border:       '1px solid rgba(255,255,255,0.13)',
  borderRadius: '8px',
  color:        T.textSecondary,
  padding:      '.4rem 1rem',
  cursor:       'pointer',
  fontSize:     '.875rem',
}

const dangerBtn = {
  background:   'rgba(239,68,68,0.25)',
  border:       '1px solid rgba(239,68,68,0.35)',
  borderRadius: '8px',
  color:        '#fca5a5',
  padding:      '.3rem .7rem',
  cursor:       'pointer',
  fontSize:     '.8rem',
}

const smallBtn = {
  background:   'rgba(255,255,255,0.08)',
  border:       '1px solid rgba(255,255,255,0.13)',
  borderRadius: '6px',
  color:        T.textSecondary,
  padding:      '.25rem .6rem',
  cursor:       'pointer',
  fontSize:     '.78rem',
}

// ─── Inject keyframes (inline styles can't define @keyframes) ─────────────────
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes orb-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes orb-pulse  { 0%,100% { transform: scale(1); opacity: .85; } 50% { transform: scale(1.08); opacity: 1; } }
  @keyframes orb-float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
  @keyframes ring-spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes shimmer    { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
`
if (!document.querySelector('#dtp-keyframes')) {
  styleSheet.id = 'dtp-keyframes'
  document.head.appendChild(styleSheet)
}

// ─── Animated glass orb component (pure CSS, no images needed) ────────────────
function GlassOrb({ size = 120, style: extraStyle = {}, spin = true, pulse = true }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', position: 'relative',
      animation: `${spin ? 'orb-rotate 30s linear infinite,' : ''} ${pulse ? 'orb-pulse 6s ease-in-out infinite' : ''}`,
      ...extraStyle,
    }}>
      {/* Outer glass shell */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(ellipse at 35% 30%, rgba(160,220,255,0.35) 0%, rgba(80,160,240,0.15) 35%, rgba(40,100,200,0.06) 65%, transparent 100%)',
        boxShadow: 'inset -6px -6px 18px rgba(0,40,100,0.12), inset 4px 4px 12px rgba(180,230,255,0.18), 0 0 50px rgba(100,180,255,0.1)',
        border: '1px solid rgba(180,220,255,0.15)',
      }} />
      {/* Inner highlight */}
      <div style={{
        position: 'absolute', width: '55%', height: '35%', top: '12%', left: '18%',
        borderRadius: '50%', transform: 'rotate(-20deg)',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(220,245,255,0.55) 0%, rgba(160,220,255,0.1) 70%, transparent 100%)',
        filter: 'blur(2px)',
      }} />
      {/* Rim light */}
      <div style={{
        position: 'absolute', inset: '3%', borderRadius: '50%',
        border: '1px solid rgba(180,230,255,0.12)',
        background: 'transparent',
      }} />
    </div>
  )
}

// ─── Login hero with animated orbs ────────────────────────────────────────────
function LoginHero() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '2rem 0 1rem', animation: 'fade-in-up 0.8s ease-out',
    }}>
      <div style={{ position: 'relative', width: 180, height: 180, marginBottom: '1.5rem' }}>
        {/* Main sphere */}
        <GlassOrb size={120} style={{ position: 'absolute', top: 30, left: 30 }} spin={false} />
        {/* Orbiting ring */}
        <div style={{
          position: 'absolute', inset: 0,
          border: '1.5px solid rgba(130,200,255,0.2)',
          borderTop: '1.5px solid rgba(130,200,255,0.5)',
          borderRadius: '50%',
          animation: 'ring-spin 8s linear infinite',
        }} />
        {/* Second ring */}
        <div style={{
          position: 'absolute', inset: '10%',
          border: '1px solid rgba(130,200,255,0.12)',
          borderBottom: '1px solid rgba(130,200,255,0.35)',
          borderRadius: '50%',
          animation: 'ring-spin 12s linear infinite reverse',
        }} />
        {/* Small orbiting dot */}
        <div style={{
          position: 'absolute', width: 10, height: 10, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,230,255,0.8), rgba(100,180,255,0.3))',
          top: 0, left: '50%', marginLeft: -5,
          boxShadow: '0 0 12px rgba(130,200,255,0.6)',
          animation: 'ring-spin 8s linear infinite',
          transformOrigin: '5px 90px',
        }} />
      </div>
      <h1 style={{
        margin: 0, fontSize: '1.6rem', fontWeight: 800, letterSpacing: '.03em',
        background: 'linear-gradient(135deg, #e0f0ff 0%, #818cf8 50%, #60a5fa 100%)',
        backgroundSize: '200% auto',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        animation: 'shimmer 4s linear infinite',
      }}>
        Digital Twin Platform
      </h1>
      <p style={{ margin: '.5rem 0 0', fontSize: '.9rem', color: T.textMuted }}>
        Sign in to access your twins and services
      </p>
    </div>
  )
}

function Badge({ ok, neutral, label, value }) {
  const s = ok    ? { bg: 'rgba(16,185,129,0.18)', border: 'rgba(16,185,129,0.35)', text: '#6ee7b7' }
           : neutral ? { bg: T.glassBg, border: T.glassBorder, text: T.textSecondary }
           : { bg: 'rgba(239,68,68,0.18)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5' }
  return (
    <span style={{
      fontSize: '.78rem', padding: '.25rem .7rem', borderRadius: '9999px',
      border: `1px solid ${s.border}`, background: s.bg, color: s.text,
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      fontWeight: 500, letterSpacing: '.02em',
    }}>
      {label}: <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  )
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function refreshAccessToken() {
  const refresh = localStorage.getItem(refreshKey)
  if (!refresh) return null
  try {
    const res = await fetch(`${apiBase}/api/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (data && data.access) {
      localStorage.setItem(tokenKey, data.access)
      return data.access
    }
  } catch { /* ignore */ }
  return null
}

async function authFetch(url, init = {}) {
  const t = localStorage.getItem(tokenKey)
  const headers = new Headers(init.headers || {})
  if (t) headers.set('Authorization', `Bearer ${t}`)
  let res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    const newTok = await refreshAccessToken()
    if (newTok) {
      const h2 = new Headers(init.headers || {})
      h2.set('Authorization', `Bearer ${newTok}`)
      res = await fetch(url, { ...init, headers: h2 })
    }
  }
  return res
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [email, setEmail] = useState('demo@example.com')
  const [pw, setPw] = useState('demo12345')
  const [status, setStatus] = useState('')
  const [me, setMe] = useState(null)
  const [twins, setTwins] = useState([])
  const [services, setServices] = useState([])
  const [registryTwins, setRegistryTwins] = useState([])
  const [lastData, setLastData] = useState({})
  const [health, setHealth] = useState({ ok: false, db: false, influx_configured: false, cron: false, ts: '' })
  const [scope, setScope] = useState('mine')
  const [activeTab, _setActiveTab] = useState(() => localStorage.getItem('dtp_tab') || 'twins')
  const setActiveTab = (tab) => { _setActiveTab(tab); localStorage.setItem('dtp_tab', tab) }
  const [showApi, setShowApi] = useState(false)

  const [admin, setAdmin] = useState({ users: [], twins: [], grants: [], services: [], serviceGrants: [] })
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '' })
  const [newTwin, setNewTwin] = useState({ name: '', ui_url: '', dtr_id: '' })
  const [newGrant, setNewGrant] = useState({ username: '', twin_id: '' })
  const [newServiceGrant, setNewServiceGrant] = useState({ username: '', service_id: '' })
  const [adminSection, setAdminSection] = useState('users')

  // Registration wizard state
  const [regStep, setRegStep] = useState(0)
  const [regMode, setRegMode] = useState(null)
  const [regForm, setRegForm] = useState({
    twin_name: '', twin_id: '', tenant: 'demo', domain_tags: '',
    github_url: '', files: null,        // repo source
    dockerfileText: '',                 // user's Dockerfile or docker-compose content
    dockerfileType: 'dockerfile',       // 'dockerfile' | 'compose'
    exposedPort: '',                    // port their service exposes
    // External mode
    external_api_url: '', mqtt_broker_host: '', mqtt_broker_port: 1883,
    mqtt_topics: [''], data_streams: [''],
    // Information Fabric stream mapping
    fabric: { data: [], decisions: [], queries: [], state: [] },
  })
  const [platformMethod, setPlatformMethod] = useState(null) // 'guided' | 'advanced' | 'github'
  const [fabricData, setFabricData] = useState(null)

  const fabricCats = [
    { key: 'data',      label: 'Data',      color: '#60a5fa', desc: 'Raw telemetry, processed signals, timeseries', subtypes: ['raw_data', 'processed_data'] },
    { key: 'decisions', label: 'Decisions', color: '#f59e0b', desc: 'Alerts, insights, analytical results', subtypes: ['decisions', 'insights'] },
    { key: 'queries',   label: 'Queries',   color: '#a78bfa', desc: 'On-demand lookups, commands, actions', subtypes: ['queries', 'commands'] },
    { key: 'state',     label: 'State',     color: '#34d399', desc: 'Config, lifecycle status, health', subtypes: ['state'] },
  ]

  const FabricMapper = () => (
    <div style={{ ...glass, padding: '1.25rem 1.5rem', marginTop: '1.25rem' }}>
      <h4 style={{ margin: '0 0 .35rem', fontSize: '.95rem', color: T.textPrimary, fontWeight: 700 }}>Information Fabric</h4>
      <p style={{ fontSize: '.78rem', color: T.textMuted, margin: '0 0 1rem', lineHeight: 1.5 }}>
        Map your twin's data streams to the platform's information pipeline. Click a category to add a stream.
      </p>
      {fabricCats.map(cat => {
        const entries = regForm.fabric[cat.key] || []
        return (
          <div key={cat.key} style={{ marginBottom: '.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: '.85rem', fontWeight: 700, color: T.textPrimary }}>{cat.label}</span>
              <span style={{ fontSize: '.7rem', color: T.textMuted }}>— {cat.desc}</span>
              {entries.length === 0 && (
                <button onClick={() => {
                  const f = {...regForm.fabric}
                  f[cat.key] = [{ name: '', protocol: cat.key === 'queries' ? 'API' : 'MQTT', trigger: cat.key === 'queries' ? 'on-demand' : 'event', format: 'structured', subtype: cat.subtypes[0] }]
                  setRegForm({...regForm, fabric: f})
                }} style={{ ...smallBtn, fontSize: '.7rem', marginLeft: 'auto', padding: '.2rem .5rem' }}>+ Add</button>
              )}
            </div>
            {entries.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: '.35rem', marginBottom: '.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={entry.name || ''} placeholder='Stream name' style={{ ...glassInput, fontSize: '.78rem', padding: '.3rem .5rem', flex: '1 1 140px', minWidth: 120 }}
                  onChange={e => { const f = {...regForm.fabric}; f[cat.key] = [...f[cat.key]]; f[cat.key][i] = {...f[cat.key][i], name: e.target.value}; setRegForm({...regForm, fabric: f}) }} />
                <select value={entry.protocol || 'MQTT'} style={{ ...glassInput, fontSize: '.75rem', padding: '.3rem .35rem', width: 85 }}
                  onChange={e => { const f = {...regForm.fabric}; f[cat.key] = [...f[cat.key]]; f[cat.key][i] = {...f[cat.key][i], protocol: e.target.value}; setRegForm({...regForm, fabric: f}) }}>
                  <option value="MQTT">MQTT</option><option value="API">API</option><option value="API/MQTT">Both</option>
                </select>
                <select value={entry.trigger || 'event'} style={{ ...glassInput, fontSize: '.75rem', padding: '.3rem .35rem', width: 90 }}
                  onChange={e => { const f = {...regForm.fabric}; f[cat.key] = [...f[cat.key]]; f[cat.key][i] = {...f[cat.key][i], trigger: e.target.value}; setRegForm({...regForm, fabric: f}) }}>
                  <option value="event">Event</option><option value="on-demand">On-demand</option>
                </select>
                <select value={entry.subtype || cat.subtypes[0]} style={{ ...glassInput, fontSize: '.75rem', padding: '.3rem .35rem', width: 95 }}
                  onChange={e => { const f = {...regForm.fabric}; f[cat.key] = [...f[cat.key]]; f[cat.key][i] = {...f[cat.key][i], subtype: e.target.value}; setRegForm({...regForm, fabric: f}) }}>
                  {cat.subtypes.map(st => <option key={st} value={st}>{st.replace('_', ' ')}</option>)}
                </select>
                <button onClick={() => { const f = {...regForm.fabric}; f[cat.key] = f[cat.key].filter((_, j) => j !== i); setRegForm({...regForm, fabric: f}) }}
                  style={{ ...dangerBtn, padding: '.2rem .45rem', fontSize: '.72rem' }}>×</button>
              </div>
            ))}
            {entries.length > 0 && (
              <button onClick={() => {
                const f = {...regForm.fabric}
                f[cat.key] = [...f[cat.key], { name: '', protocol: cat.key === 'queries' ? 'API' : 'MQTT', trigger: cat.key === 'queries' ? 'on-demand' : 'event', format: 'structured', subtype: cat.subtypes[0] }]
                setRegForm({...regForm, fabric: f})
              }} style={{ ...smallBtn, fontSize: '.7rem', marginTop: '.1rem', padding: '.15rem .45rem' }}>+ Another</button>
            )}
          </div>
        )
      })}
    </div>
  )
  const [regResult, setRegResult] = useState(null)
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const fileInputRef = useRef(null)

  const regReset = () => {
    setRegStep(0); setRegMode(null); setRegResult(null); setRegError(''); setPlatformMethod(null)
    setRegForm({ twin_name: '', twin_id: '', tenant: 'demo', domain_tags: '', github_url: '', files: null, dockerfileText: '', dockerfileType: 'dockerfile', exposedPort: '', external_api_url: '', mqtt_broker_host: '', mqtt_broker_port: 1883, mqtt_topics: [''], data_streams: [''], fabric: { data: [], decisions: [], queries: [], state: [] } })
  }
  const pyInputRef = useRef(null)

  const downloadTemplate = async (name) => {
    const res = await authFetch(`${apiBase}/api/register/templates/${name}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  const submitRegistration = async () => {
    setRegLoading(true); setRegError('')
    try {
      if (regMode === 'external') {
        const res = await authFetch(`${apiBase}/api/register/twin`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'external', twin_name: regForm.twin_name,
            twin_id: regForm.twin_id || undefined, tenant: regForm.tenant,
            domain_tags: regForm.domain_tags.split(',').map(s => s.trim()).filter(Boolean),
            external_api_url: regForm.external_api_url,
            mqtt_broker_host: regForm.mqtt_broker_host, mqtt_broker_port: regForm.mqtt_broker_port,
            mqtt_topics: regForm.mqtt_topics.filter(Boolean),
            data_streams: regForm.data_streams.filter(Boolean),
            fabric: (() => { const f = {}; for (const [k, v] of Object.entries(regForm.fabric)) { if (v.length) f[k] = v }; return Object.keys(f).length ? f : undefined })(),
          }),
        })
        const data = await res.json()
        if (!res.ok) { setRegError(data.error || 'Registration failed'); setRegLoading(false); return }
        setRegResult(data); setRegStep(4)
        await Promise.all([loadTwins(), loadRegistryTwins()])
      } else if (regMode === 'platform') {
        // Unified platform flow: repo (zip or github) + dockerfile + fabric
        const fabricClean = {}
        for (const [k, v] of Object.entries(regForm.fabric)) { if (v.length) fabricClean[k] = v }
        if (!regForm.files && !regForm.github_url) { setRegError('Provide a repo zip or GitHub URL'); setRegLoading(false); return }
        const fd = new FormData()
        fd.append('twin_name', regForm.twin_name)
        if (regForm.twin_id) fd.append('twin_id', regForm.twin_id)
        fd.append('tenant', regForm.tenant)
        fd.append('domain_tags', regForm.domain_tags)
        if (regForm.github_url) fd.append('github_url', regForm.github_url)
        if (regForm.files) fd.append('repo', regForm.files)
        fd.append('dockerfile_text', regForm.dockerfileText)
        fd.append('dockerfile_type', regForm.dockerfileType)
        if (regForm.exposedPort) fd.append('exposed_port', regForm.exposedPort)
        if (Object.keys(fabricClean).length) fd.append('fabric', JSON.stringify(fabricClean))
        const res = await authFetch(`${apiBase}/api/register/twin/guided`, { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { setRegError(data.error || 'Registration failed'); setRegLoading(false); return }
        setRegResult(data); setRegStep(4)
        await Promise.all([loadTwins(), loadRegistryTwins()])
      }
    } catch (e) {
      setRegError(e.message || 'Network error')
    }
    setRegLoading(false)
  }

  // Poll build status when on Step 4 with building status
  useEffect(() => {
    if (regStep !== 4 || !regResult?.id) return
    if (regResult.status !== 'building' && regResult.status !== 'validating') return
    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`${apiBase}/api/register/twin/${regResult.id}/status`)
        if (!res.ok) return
        const data = await res.json()
        setRegResult(prev => ({ ...prev, ...data }))
        if (data.status === 'ready' || data.status === 'failed') {
          clearInterval(interval)
          if (data.status === 'ready') { loadTwins(); loadRegistryTwins() }
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [regStep, regResult?.id, regResult?.status])

  const loadFabric = async () => {
    if (!localStorage.getItem(tokenKey)) return
    const res = await authFetch(`${apiBase}/api/fabric`)
    if (res.ok) setFabricData(await res.json())
  }

  const safeText = async (res) => { try { return await res.text() } catch { return '' } }

  const login = async () => {
    setStatus('Signing in…')
    try {
      const res = await fetch(`${apiBase}/api/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password: pw })
      })
      if (!res.ok) { const msg = await safeText(res); setStatus(`Login failed${msg ? `: ${msg}` : ''}`); return }
      const data = await res.json()
      if (!data?.access) { setStatus('Login failed: no token'); return }
      if (data.refresh) localStorage.setItem(refreshKey, data.refresh)
      localStorage.setItem(tokenKey, data.access)
      setStatus('Signed in')
      setActiveTab('twins')
      await Promise.all([loadMe(), loadTwins(), loadServices(), loadRegistryTwins(), loadLastData()])
    } catch (err) {
      setStatus('Login failed: network/CORS error')
      console.error('login error', err)
    }
  }

  const loadTwins = async () => {
    if (!localStorage.getItem(tokenKey)) { setTwins([]); return }
    const res = await authFetch(`${apiBase}/api/me/twins/`)
    if (!res.ok) { setTwins([]); return }
    setTwins(await res.json())
  }

  const loadServices = async () => {
    if (!localStorage.getItem(tokenKey)) { setServices([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await authFetch(`${apiBase}/api/registry/services/list?scope=${encodeURIComponent(s)}`)
    if (!res.ok) { setServices([]); return }
    setServices(await res.json())
  }

  const loadRegistryTwins = async () => {
    if (!localStorage.getItem(tokenKey)) { setRegistryTwins([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await authFetch(`${apiBase}/api/registry/twins?scope=${encodeURIComponent(s)}`)
    if (!res.ok) { setRegistryTwins([]); return }
    setRegistryTwins(await res.json())
  }

  const loadLastData = async () => {
    if (!localStorage.getItem(tokenKey)) { setLastData({}); return }
    const res = await authFetch(`${apiBase}/api/last-data/my`)
    if (!res.ok) { setLastData({}); return }
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data.items || [])
    const map = {}
    items.forEach(it => { if (it?.twin_id) map[it.twin_id] = { ts: it.last_ts || null, source: it.source || null } })
    setLastData(map)
  }

  const loadMe = async () => {
    if (!localStorage.getItem(tokenKey)) { setMe(null); return }
    const res = await authFetch(`${apiBase}/api/me/`)
    if (!res.ok) { setMe(null); return }
    const info = await res.json()
    setMe(info)
    if (info.is_staff) await loadAdmin()
  }

  const loadHealth = async () => {
    try {
      const res = await fetch(`${apiBase}/api/healthz`)
      if (!res.ok) return
      setHealth(await res.json())
    } catch { /* ignore */ }
  }

  const loadAdmin = async () => {
    const [users, twinsList, twinGrants, svcGrants, svcList] = await Promise.all([
      authFetch(`${apiBase}/api/admin/users`).then(r => r.ok ? r.json() : []),
      authFetch(`${apiBase}/api/admin/twins`).then(r => r.ok ? r.json() : []),
      authFetch(`${apiBase}/api/admin/grants`).then(r => r.ok ? r.json() : []),
      authFetch(`${apiBase}/api/admin/service-grants`).then(r => r.ok ? r.json() : []),
      authFetch(`${apiBase}/api/registry/services/list?scope=all`).then(r => r.ok ? r.json() : []),
    ])
    setAdmin({ users, twins: twinsList, grants: twinGrants, services: svcList, serviceGrants: svcGrants })
  }

  const createUser = async () => {
    const res = await authFetch(`${apiBase}/api/admin/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) })
    if (res.ok) { setNewUser({ username: '', email: '', password: '' }); await loadAdmin() }
  }
  const deleteUser = async (username) => {
    if (!confirm(`Delete user ${username}?`)) return
    await authFetch(`${apiBase}/api/admin/users`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) })
    await loadAdmin()
  }
  const createTwin = async () => {
    const res = await authFetch(`${apiBase}/api/admin/twins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTwin) })
    if (res.ok) { setNewTwin({ name: '', ui_url: '', dtr_id: '' }); await loadAdmin() }
  }
  const deleteTwin = async (twin_id) => {
    if (!confirm(`Delete twin ${twin_id}?`)) return
    await authFetch(`${apiBase}/api/admin/twins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ twin_id }) })
    await loadAdmin()
  }
  const createGrant = async () => {
    const res = await authFetch(`${apiBase}/api/admin/grants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newGrant) })
    if (res.ok) { setNewGrant({ username: '', twin_id: '' }); await loadAdmin() }
  }
  const deleteGrant = async (username, twin_id) => {
    if (!confirm(`Remove grant ${username} -> ${twin_id}?`)) return
    await authFetch(`${apiBase}/api/admin/grants`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, twin_id }) })
    await loadAdmin()
  }
  const createServiceGrant = async () => {
    const res = await authFetch(`${apiBase}/api/admin/service-grants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newServiceGrant) })
    if (res.ok) { setNewServiceGrant({ username: '', service_id: '' }); await loadAdmin() }
  }
  const deleteServiceGrant = async (username, service_id) => {
    if (!confirm(`Remove service grant ${username} -> ${service_id}?`)) return
    await authFetch(`${apiBase}/api/admin/service-grants`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, service_id }) })
    await loadAdmin()
  }
  const scanTwins = async () => {
    setStatus('Scanning repo for twins…')
    try {
      const res = await authFetch(`${apiBase}/api/admin/scan`, { method: 'POST' })
      if (res.ok) { setStatus('Scan complete'); await Promise.all([loadRegistryTwins(), loadTwins(), loadAdmin()]) }
      else { const err = await res.json().catch(() => ({})); setStatus(`Scan failed${err?.error ? ': ' + err.error : ''}`) }
    } catch { setStatus('Scan error') }
  }

  useEffect(() => { loadTwins() }, [])
  useEffect(() => { loadServices() }, [])
  useEffect(() => {
    const id = setInterval(() => { refreshAccessToken().catch(() => null) }, 9 * 60 * 1000)
    const hasAccess = !!localStorage.getItem(tokenKey)
    const hasRefresh = !!localStorage.getItem(refreshKey)
    if (hasAccess) { loadMe(); loadTwins(); loadServices(); loadRegistryTwins(); loadLastData() }
    else if (hasRefresh) refreshAccessToken().then(() => { loadMe(); loadTwins(); loadServices(); loadRegistryTwins(); loadLastData() }).catch(() => null)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    loadHealth()
    const id = setInterval(loadHealth, 10000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const token = localStorage.getItem(tokenKey)
    if (!token) return
    const es = new EventSource(`${apiBase}/api/portal/stream`, { withCredentials: false })
    es.onmessage = (ev) => {
      try { const msg = JSON.parse(ev.data); if (msg?.type?.startsWith('twin.')) { loadRegistryTwins(); loadTwins(); loadLastData() } } catch { /* ignore */ }
    }
    es.onerror = () => { try { es.close() } catch { /* ignore */ } }
    return () => { try { es.close() } catch { /* ignore */ } }
  }, [me])
  useEffect(() => { if (me) { loadServices(); loadRegistryTwins() } }, [scope])

  const navItems = [
    { key: 'twins',    label: 'Twins',    icon: '⬡' },
    { key: 'services', label: 'Services', icon: '◈' },
    { key: 'registry', label: 'DTR',      icon: '◉' },
  ]
  navItems.push({ key: 'fabric', label: 'Fabric', icon: '◬' })
  navItems.push({ key: 'synthesize', label: 'Synthesize', icon: '⬡' })
  navItems.push({ key: 'generator', label: 'AI Generator', icon: '⚛' })
  navItems.push({ key: 'processes', label: 'Processes', icon: '⚙' })
  navItems.push({ key: 'register', label: 'Register', icon: '＋' })
  if (me?.is_staff) navItems.push({ key: 'admin', label: 'Admin', icon: '⚙' })

  const ScopeToggle = ({ onMine, onAll }) => (
    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginBottom: '.75rem' }}>
      <span style={{ fontSize: '.8rem', color: T.textMuted, marginRight: '.25rem' }}>Scope</span>
      <button type='button' onClick={onMine} style={scope === 'mine' ? glassBtn : ghostBtn}>Mine</button>
      <button type='button' onClick={onAll}  style={scope === 'all'  ? glassBtn : ghostBtn}>All</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 'none', margin: '0 auto', padding: '1rem 1.25rem' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        ...glass,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 1.5rem', marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{ position: 'relative', width: 38, height: 38 }}>
            <GlassOrb size={38} spin={false} pulse={false} style={{}} />
            <div style={{
              position: 'absolute', inset: '-4px', borderRadius: '50%',
              border: '1px solid rgba(130,200,255,0.15)',
              borderTop: '1px solid rgba(130,200,255,0.4)',
              animation: 'ring-spin 6s linear infinite',
            }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: T.textPrimary, letterSpacing: '.02em' }}>
            DTP Portal
          </span>
        </div>
        {me ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <span style={{ fontSize: '.85rem', color: T.textSecondary }}>
              <span style={{ color: T.accent, fontWeight: 600 }}>{me.username}</span>
              {me.is_staff && <span style={{ marginLeft: '.4rem', fontSize: '.75rem', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '9999px', padding: '.1rem .5rem', color: T.accent }}>admin</span>}
            </span>
            <button type='button' onClick={() => {
              localStorage.removeItem(tokenKey); localStorage.removeItem(refreshKey)
              setMe(null); setTwins([]); setServices([]); setRegistryTwins([])
              setAdmin({ users: [], twins: [], grants: [], services: [], serviceGrants: [] })
              setStatus('')
            }} style={ghostBtn}>Logout</button>
          </div>
        ) : null}
      </header>

      {/* ── Health badges ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginBottom: '1rem' }}>
        <Badge neutral label='Backend' value={apiBase || window.location.origin} />
        <Badge ok={health.ok}               label='Health' value={health.ok ? 'OK' : 'Down'} />
        <Badge ok={health.db}               label='DB'     value={health.db ? 'OK' : 'ERR'} />
        <Badge ok={health.influx_configured} label='Influx' value={health.influx_configured ? 'Yes' : 'No'} />
        <Badge ok={health.cron} neutral={!health.cron} label='Cron' value={health.cron ? 'ON' : 'OFF'} />
        <Badge neutral label='Updated' value={health.ts || '—'} />
      </div>

      {/* ── Login ──────────────────────────────────────────────────────── */}
      {!me && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 440, margin: '0 auto' }}>
          <LoginHero />
          <div style={{ ...glassCard, width: '100%', animation: 'fade-in-up 0.8s ease-out 0.2s both' }}>
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', color: T.textPrimary, fontWeight: 700, textAlign: 'center' }}>Sign In</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              <input
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder='Email or username' style={glassInput}
              />
              <input
                type='password' value={pw} onChange={e => setPw(e.target.value)}
                placeholder='Password' style={glassInput}
                onKeyDown={e => e.key === 'Enter' && login()}
              />
              <button onClick={login} style={{ ...glassBtn, padding: '.6rem 1.5rem', width: '100%', marginTop: '.25rem', fontSize: '.95rem' }}>Login</button>
              {status && (
                <div style={{ textAlign: 'center', fontSize: '.85rem', color: status.startsWith('Login failed') ? '#fca5a5' : '#6ee7b7' }}>
                  {status}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Nav ────────────────────────────────────────────────────── */}
      {me && (
        <nav style={{ display: 'flex', gap: '.4rem', margin: '1rem 0', flexWrap: 'wrap' }}>
          {navItems.map(item => {
            const active = activeTab === item.key
            return (
              <button key={item.key} type='button' onClick={() => setActiveTab(item.key)} style={{
                ...glass,
                padding: '.5rem 1.25rem',
                border: active ? `1px solid ${T.accentBorder}` : `1px solid ${T.glassBorder}`,
                background: active ? T.accentBg : T.glassBg,
                color: active ? '#fff' : T.textSecondary,
                cursor: 'pointer',
                fontWeight: active ? 600 : 400,
                fontSize: '.9rem',
                borderRadius: '10px',
                boxShadow: active ? '0 4px 16px rgba(99,102,241,0.3)' : T.shadowSm,
              }}>
                <span style={{ marginRight: '.35rem', opacity: .7 }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Twins Tab ──────────────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'twins' ? 'block' : 'none' }}>
        <div style={glassCard}>
          <h2 style={sectionHeading}>Your Twins</h2>
          {!me ? (
            <p style={{ color: T.textMuted, fontStyle: 'italic' }}>Sign in to view your granted twins.</p>
          ) : twins.length === 0 ? (
            <p style={{ color: T.textMuted, fontStyle: 'italic' }}>No twins granted yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {twins.filter(t => {
                const rt = registryTwins.find(r => r.twin_id === t.dtr_id)
                const domain = rt?.metadata?.domain || []
                return !domain.includes('Process') && !domain.includes('Composite')
              }).map(t => {
                const match = registryTwins.find(rt => rt.twin_id === t.dtr_id) || registryTwins.find(rt => (rt.interfaces && rt.interfaces.api) === t.ui_url)
                const ld = (match && lastData && lastData[match.twin_id]) || null
                const lastTs = ld && typeof ld === 'object' ? ld.ts : null
                const last = lastTs ? new Date(lastTs) : null
                const lastLabel = last && !Number.isNaN(last.getTime()) ? last.toLocaleString() : null
                return (
                  <div key={t.twin_id} style={{
                    ...glass, padding: '1.1rem 1.25rem',
                    borderTop: '2px solid rgba(99,102,241,0.3)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: T.textPrimary, marginBottom: '.5rem' }}>{t.name}</div>
                    <a href={t.ui_url} target='_blank' rel='noopener' style={linkBtn}>Open UI ↗</a>
                    <div style={{ marginTop: '.6rem', fontSize: '.8rem', color: T.textMuted }}>
                      {lastLabel ? `Last data: ${lastLabel}` : 'Last data: unknown'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Services Tab ───────────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'services' ? 'block' : 'none' }}>
        <div style={glassCard}>
          <h2 style={sectionHeading}>Services</h2>
          {me?.is_staff && (
            <ScopeToggle
              onMine={() => { setScope('mine'); loadServices() }}
              onAll={() => { setScope('all'); loadServices() }}
            />
          )}
          {!me ? (
            <p style={{ color: T.textMuted, fontStyle: 'italic' }}>Sign in to view services.</p>
          ) : services.length === 0 ? (
            <p style={{ color: T.textMuted, fontStyle: 'italic' }}>No services available.</p>
          ) : (
            <div style={{ display: 'grid', gap: '.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {services.map(s => {
                const api = s.interfaces?.api || ''
                return (
                  <div key={s.id || s.name} style={{ ...glass, padding: '1.1rem 1.25rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '.95rem', color: T.textPrimary, marginBottom: '.4rem' }}>{s.name}</div>
                    <div style={{ fontSize: '.82rem', color: T.textMuted, marginBottom: '.6rem' }}>
                      <div>Category: {s.category || '—'}</div>
                      {s.health ? <div>Health: <code style={codeStyle}>{s.health}</code></div> : null}
                    </div>
                    {api
                      ? <a href={api} target='_blank' rel='noopener' style={linkBtn}>Open Service ↗</a>
                      : <span style={{ fontSize: '.82rem', color: T.textMuted }}>No UI URL</span>
                    }
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── DTR Tab ────────────────────────────────────────────────────── */}
      <div style={{ display: activeTab === 'registry' ? 'block' : 'none' }}>
        <div style={glassCard}>
          <h2 style={sectionHeading}>Digital Twin Registry</h2>
          {!me ? (
            <p style={{ color: T.textMuted, fontStyle: 'italic' }}>Sign in to explore the registry.</p>
          ) : (
            <>
              {me?.is_staff && (
                <ScopeToggle
                  onMine={() => { setScope('mine'); loadRegistryTwins(); loadServices() }}
                  onAll={() => { setScope('all'); loadRegistryTwins(); loadServices() }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                {registryTwins.map(t => {
                  const ld = lastData[t.twin_id] || null
                  const lastTs = ld && typeof ld === 'object' ? ld.ts : null
                  const last = lastTs ? new Date(lastTs) : null
                  const lastLabel = last && !Number.isNaN(last.getTime()) ? last.toLocaleString() : null
                  const sourceLabel = ld && typeof ld === 'object' && ld.source ? ld.source : null
                  return (
                    <div key={t.twin_id} style={{ ...glass, padding: '1rem 1.25rem' }}>
                      <div style={{ fontWeight: 700, color: T.textPrimary, marginBottom: '.35rem' }}>
                        {t.twin_id}
                        {t.metadata?.status && <span style={{ marginLeft: '.5rem', fontSize: '.8rem', color: T.accent }}>({t.metadata.status})</span>}
                      </div>
                      <div style={{ fontSize: '.83rem', color: T.textSecondary, display: 'grid', gap: '.15rem' }}>
                        <div>API: <code style={codeStyle}>{t.interfaces?.api || '—'}</code></div>
                        <div>Streams: {(t.interfaces?.data_streams || []).join(', ') || '—'}</div>
                        <div>Domain: {(t.metadata?.domain || []).join(', ') || '—'}</div>
                        <div style={{ color: T.textMuted }}>
                          Last data: {lastLabel || 'unknown'}{sourceLabel ? ` · source: ${sourceLabel}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Admin Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'admin' && me?.is_staff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Admin header bar */}
          <div style={{ ...glass, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: T.textPrimary, fontWeight: 700 }}>Admin Panel</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <button onClick={scanTwins} style={glassBtn}>Scan Repo</button>
              {status && <span style={{ fontSize: '.82rem', color: T.accent }}>{status}</span>}
            </div>
          </div>

          {/* Admin sub-nav */}
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
            {[
              { key: 'users',    label: 'Users' },
              { key: 'twins',    label: 'Twin Cards' },
              { key: 'tgrants',  label: 'Twin Grants' },
              { key: 'services', label: 'Service Grants' },
            ].map(tab => {
              const active = adminSection === tab.key
              return (
                <button key={tab.key} type='button' onClick={() => setAdminSection(tab.key)} style={{
                  padding: '.4rem 1rem', borderRadius: '8px', cursor: 'pointer', fontSize: '.85rem', fontWeight: active ? 600 : 400,
                  background: active ? T.accentBg : 'rgba(255,255,255,0.05)',
                  border: active ? `1px solid ${T.accentBorder}` : '1px solid rgba(255,255,255,0.08)',
                  color: active ? '#fff' : T.textSecondary,
                  boxShadow: active ? '0 4px 16px rgba(99,102,241,0.25)' : 'none',
                }}>
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ─── Users section ─────────────────────────────────────────── */}
          {adminSection === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Create user form */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <h3 style={{ ...subHeading, marginBottom: '1rem' }}>Create New User</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={formLabel}>Username</label>
                    <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} placeholder='e.g. john.doe' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>Email</label>
                    <input value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder='john@example.com' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>Password</label>
                    <input value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder='strong password' style={glassInput} />
                  </div>
                  <div>
                    <button onClick={createUser} style={{ ...glassBtn, width: '100%' }}>Create User</button>
                  </div>
                </div>
              </div>

              {/* Existing users list */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ ...subHeading, margin: 0 }}>Existing Users</h3>
                  <span style={{ fontSize: '.8rem', color: T.textMuted }}>{admin.users.length} total</span>
                </div>
                {admin.users.length === 0 ? (
                  <p style={{ color: T.textMuted, fontStyle: 'italic', margin: 0 }}>No users yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.6rem' }}>
                    {admin.users.map(u => (
                      <div key={u.id} style={{ ...glass, padding: '.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', color: T.accent, fontWeight: 700 }}>
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: T.textPrimary, fontWeight: 600, fontSize: '.9rem' }}>{u.username}</div>
                            {u.is_staff && <span style={adminPill}>admin</span>}
                          </div>
                        </div>
                        <button onClick={() => deleteUser(u.username)} style={dangerBtn}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Twin Cards section ────────────────────────────────────── */}
          {adminSection === 'twins' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Create twin form */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <h3 style={{ ...subHeading, marginBottom: '1rem' }}>Create New Twin Card</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={formLabel}>Name</label>
                    <input value={newTwin.name} onChange={e => setNewTwin({ ...newTwin, name: e.target.value })} placeholder='My Twin' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>UI URL</label>
                    <input value={newTwin.ui_url} onChange={e => setNewTwin({ ...newTwin, ui_url: e.target.value })} placeholder='https://...' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>DTR ID</label>
                    <input value={newTwin.dtr_id} onChange={e => setNewTwin({ ...newTwin, dtr_id: e.target.value })} placeholder='optional' style={glassInput} />
                  </div>
                  <div>
                    <button onClick={createTwin} style={{ ...glassBtn, width: '100%' }}>Create Twin</button>
                  </div>
                </div>
              </div>

              {/* Existing twin cards */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ ...subHeading, margin: 0 }}>Existing Twin Cards</h3>
                  <span style={{ fontSize: '.8rem', color: T.textMuted }}>{(admin.twins || []).length} total</span>
                </div>
                {(admin.twins || []).length === 0 ? (
                  <p style={{ color: T.textMuted, fontStyle: 'italic', margin: 0 }}>No twin cards yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                    {(admin.twins || []).map(t => (
                      <div key={t.twin_id} style={{ ...glass, padding: '1rem 1.25rem', borderRadius: '12px', borderLeft: '3px solid rgba(99,102,241,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontWeight: 700, fontSize: '.95rem', color: T.textPrimary, marginBottom: '.4rem' }}>{t.name}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                              <div style={{ fontSize: '.8rem', color: T.textMuted }}>
                                UI: <code style={codeStyle}>{t.ui_url}</code>
                              </div>
                              {t.dtr_id && (
                                <div style={{ fontSize: '.8rem', color: T.textMuted }}>
                                  DTR: <code style={codeStyle}>{t.dtr_id}</code>
                                </div>
                              )}
                              <div style={{ fontSize: '.8rem', color: T.textMuted }}>
                                ID: <code style={codeStyle}>{t.twin_id}</code>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0, alignSelf: 'center' }}>
                            <button onClick={() => setNewGrant({ ...newGrant, twin_id: t.twin_id })} style={smallBtn}>Copy to Grant</button>
                            <button onClick={() => deleteTwin(t.twin_id)} style={dangerBtn}>Delete</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Twin Grants section ───────────────────────────────────── */}
          {adminSection === 'tgrants' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Grant access form */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <h3 style={{ ...subHeading, marginBottom: '1rem' }}>Grant Twin Access</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={formLabel}>Username</label>
                    <input value={newGrant.username} onChange={e => setNewGrant({ ...newGrant, username: e.target.value })} placeholder='user@example.com' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>Twin ID</label>
                    <input value={newGrant.twin_id} onChange={e => setNewGrant({ ...newGrant, twin_id: e.target.value })} placeholder='twin-uuid' style={glassInput} />
                  </div>
                  <div>
                    <button onClick={createGrant} style={{ ...glassBtn, width: '100%' }}>Grant Access</button>
                  </div>
                </div>
                {(admin.twins || []).length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '.78rem', color: T.textMuted, display: 'block', marginBottom: '.5rem' }}>Quick pick a twin:</span>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {(admin.twins || []).map(t => (
                        <button key={t.twin_id} onClick={() => setNewGrant({ ...newGrant, twin_id: t.twin_id })} style={{
                          ...smallBtn, fontSize: '.78rem',
                          background: newGrant.twin_id === t.twin_id ? 'rgba(99,102,241,0.3)' : smallBtn.background,
                          borderColor: newGrant.twin_id === t.twin_id ? 'rgba(99,102,241,0.4)' : smallBtn.borderColor,
                          color: newGrant.twin_id === t.twin_id ? T.accent : smallBtn.color,
                        }}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Current grants */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ ...subHeading, margin: 0 }}>Current Twin Grants</h3>
                  <span style={{ fontSize: '.8rem', color: T.textMuted }}>{(admin.grants || []).length} total</span>
                </div>
                {(admin.grants || []).length === 0 ? (
                  <p style={{ color: T.textMuted, fontStyle: 'italic', margin: 0 }}>No grants assigned yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '.5rem' }}>
                    {(admin.grants || []).map(g => (
                      <div key={`${g.user}::${g.twin_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.65rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '.85rem' }}>
                          <span style={{ color: T.accent, fontWeight: 600 }}>{g.user}</span>
                          <span style={{ color: T.textMuted, margin: '0 .5rem' }}>→</span>
                          <span style={{ color: T.textPrimary }}>{g.twin}</span>
                        </div>
                        <button onClick={() => deleteGrant(g.user, g.twin_id)} style={dangerBtn}>Revoke</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Service Grants section ────────────────────────────────── */}
          {adminSection === 'services' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Grant service form */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <h3 style={{ ...subHeading, marginBottom: '1rem' }}>Grant Service Access</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={formLabel}>Username</label>
                    <input value={newServiceGrant.username} onChange={e => setNewServiceGrant({ ...newServiceGrant, username: e.target.value })} placeholder='user@example.com' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>Service ID</label>
                    <input value={newServiceGrant.service_id} onChange={e => setNewServiceGrant({ ...newServiceGrant, service_id: e.target.value })} placeholder='service-uuid' style={glassInput} />
                  </div>
                  <div>
                    <button onClick={createServiceGrant} style={{ ...glassBtn, width: '100%' }}>Grant Access</button>
                  </div>
                </div>
                {(admin.services || []).length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '.78rem', color: T.textMuted, display: 'block', marginBottom: '.5rem' }}>Quick pick a service:</span>
                    <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                      {(admin.services || []).map(s => (
                        <button key={s.id || s.name} onClick={() => setNewServiceGrant({ username: newServiceGrant.username, service_id: s.id })} style={{
                          ...smallBtn, fontSize: '.78rem',
                          background: newServiceGrant.service_id === s.id ? 'rgba(99,102,241,0.3)' : smallBtn.background,
                          borderColor: newServiceGrant.service_id === s.id ? 'rgba(99,102,241,0.4)' : smallBtn.borderColor,
                          color: newServiceGrant.service_id === s.id ? T.accent : smallBtn.color,
                        }}>
                          {s.name} <span style={{ opacity: .5 }}>({s.category || '—'})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Current service grants */}
              <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ ...subHeading, margin: 0 }}>Current Service Grants</h3>
                  <span style={{ fontSize: '.8rem', color: T.textMuted }}>{(admin.serviceGrants || []).length} total</span>
                </div>
                {(admin.serviceGrants || []).length === 0 ? (
                  <p style={{ color: T.textMuted, fontStyle: 'italic', margin: 0 }}>No service grants assigned yet.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '.5rem' }}>
                    {(admin.serviceGrants || []).map(g => (
                      <div key={`${g.user}::${g.service_id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.65rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '.85rem' }}>
                          <span style={{ color: T.accent, fontWeight: 600 }}>{g.user}</span>
                          <span style={{ color: T.textMuted, margin: '0 .5rem' }}>→</span>
                          <span style={{ color: T.textPrimary }}>{g.service}</span>
                        </div>
                        <button onClick={() => deleteServiceGrant(g.user, g.service_id)} style={dangerBtn}>Revoke</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Register Twin Tab ─────────────────────────────────────────── */}
      {/* ── Information Fabric Tab ─────────────────────────────────── */}
      {activeTab === 'fabric' && me && (() => {
        if (!fabricData) { loadFabric(); return <div style={glassCard}><p style={{ color: T.textMuted }}>Loading fabric data…</p></div> }
        const cats = [
          { key: 'data',      label: 'Data',      color: '#60a5fa', icon: '◉', desc: 'Raw & processed data streams — telemetry, measurements, timeseries', protocols: 'API / MQTT', trigger: 'Event-triggered' },
          { key: 'decisions', label: 'Decisions', color: '#f59e0b', icon: '◈', desc: 'Decisions & insights — alerts, analytical results, recommendations', protocols: 'API', trigger: 'Event-triggered' },
          { key: 'queries',   label: 'Queries',   color: '#a78bfa', icon: '⬡', desc: 'Queries & commands — on-demand lookups, actions, control signals', protocols: 'API / MQTT', trigger: 'On-demand' },
          { key: 'state',     label: 'State',     color: '#34d399', icon: '⬢', desc: 'State — config, lifecycle, health, status changes', protocols: 'API / MQTT', trigger: 'Event-triggered' },
        ]
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.75rem' }}>
                <div>
                  <h2 style={{ margin: '0 0 .25rem', fontSize: '1.15rem', color: T.textPrimary, fontWeight: 700 }}>Information Fabric</h2>
                  <p style={{ margin: 0, fontSize: '.85rem', color: T.textMuted }}>
                    Platform-wide data stream categorization across all digital twins
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '.75rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.accent }}>{fabricData.total_streams}</div>
                    <div style={{ fontSize: '.7rem', color: T.textMuted }}>Total Streams</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: T.accent }}>{fabricData.twins.length}</div>
                    <div style={{ fontSize: '.7rem', color: T.textMuted }}>Twins</div>
                  </div>
                  <button onClick={() => { setFabricData(null); loadFabric() }} style={ghostBtn}>Refresh</button>
                </div>
              </div>
            </div>

            {/* Category cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '.75rem' }}>
              {cats.map(cat => {
                const catData = fabricData.categories[cat.key] || { count: 0, streams: [] }
                return (
                  <div key={cat.key} style={{ ...glass, padding: '1.25rem 1.5rem', borderLeft: `3px solid ${cat.color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' }}>
                      <span style={{ fontSize: '1.1rem', opacity: .7 }}>{cat.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: T.textPrimary }}>{cat.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 800, color: cat.color }}>{catData.count}</span>
                    </div>
                    <p style={{ fontSize: '.78rem', color: T.textMuted, margin: '0 0 .5rem', lineHeight: 1.5 }}>{cat.desc}</p>
                    <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.5rem' }}>
                      <span style={{ fontSize: '.68rem', padding: '.1rem .4rem', borderRadius: '4px', background: `${cat.color}22`, color: cat.color }}>{cat.protocols}</span>
                      <span style={{ fontSize: '.68rem', padding: '.1rem .4rem', borderRadius: '4px', background: `${cat.color}22`, color: cat.color }}>{cat.trigger}</span>
                    </div>
                    {catData.streams.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {catData.streams.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.78rem' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                            <span style={{ color: T.textPrimary, fontWeight: 500 }}>{s.name || s.stream}</span>
                            <span style={{ color: T.textMuted, marginLeft: 'auto', fontSize: '.7rem' }}>{s.twin_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Per-twin breakdown */}
            <div style={{ ...glass, padding: '1.5rem 1.75rem' }}>
              <h3 style={{ ...subHeading, marginBottom: '1rem' }}>Twin Stream Mapping</h3>
              {fabricData.twins.length === 0 ? (
                <p style={{ color: T.textMuted, fontStyle: 'italic' }}>No twins registered yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
                  {fabricData.twins.map(tw => {
                    const hasFabric = Object.values(tw.fabric || {}).some(v => v.length > 0)
                    return (
                      <div key={tw.twin_id} style={{ ...glass, padding: '1rem 1.25rem', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasFabric ? '.6rem' : 0 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '.92rem', color: T.textPrimary }}>{tw.name}</span>
                            <span style={{ fontSize: '.75rem', color: T.textMuted, marginLeft: '.5rem' }}>{tw.twin_id}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '.3rem' }}>
                            {cats.map(cat => {
                              const count = (tw.fabric[cat.key] || []).length
                              return count > 0 ? (
                                <span key={cat.key} style={{ fontSize: '.68rem', padding: '.1rem .4rem', borderRadius: '4px', background: `${cat.color}22`, color: cat.color, fontWeight: 600 }}>
                                  {cat.label} {count}
                                </span>
                              ) : null
                            })}
                            {!hasFabric && <span style={{ fontSize: '.72rem', color: T.textMuted, fontStyle: 'italic' }}>No streams mapped</span>}
                          </div>
                        </div>
                        {hasFabric && (
                          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                            {cats.map(cat => (tw.fabric[cat.key] || []).map((s, i) => (
                              <span key={`${cat.key}-${i}`} style={{
                                fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px',
                                background: `${cat.color}15`, border: `1px solid ${cat.color}30`, color: cat.color,
                              }}>
                                {s.name || s.stream} <span style={{ opacity: .6 }}>({s.protocol || '?'})</span>
                              </span>
                            )))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Twin Synthesis Tab ──────────────────────────────────────── */}
      {activeTab === 'synthesize' && me && (() => { if (!fabricData) loadFabric(); return null })()}
      {activeTab === 'synthesize' && me && (
        <SynthesisCanvas
          twins={registryTwins}
          fabricData={fabricData || { twins: [], categories: {} }}
          authFetch={authFetch}
          apiBase={apiBase}
          onRefresh={() => { loadRegistryTwins(); loadFabric() }}
        />
      )}

      {/* ── Processes Tab ────────────────────────────────────────────── */}
      {activeTab === 'processes' && me && (
        <ProcessCanvas authFetch={authFetch} apiBase={apiBase} />
      )}

      {/* ── AI Generator Tab (WeaveX portal) ─────────────────────────── */}
      {activeTab === 'generator' && me && (
        <div style={{ ...glassCard, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '.75rem 1.25rem', borderBottom: `1px solid ${T.glassBorder}`,
          }}>
            <span style={{ fontSize: '.9rem', color: T.textSecondary }}>
              <span style={{ color: T.accent, fontWeight: 600 }}>WeaveX</span>
              <span style={{ marginLeft: '.5rem' }}>· AI-powered DT generator</span>
            </span>
            <a href={weavexUrl} target='_blank' rel='noreferrer' style={{ ...smallBtn, textDecoration: 'none', display: 'inline-block' }}>
              Open in new tab ↗
            </a>
          </div>
          <iframe
            src={weavexUrl}
            title='WeaveX — AI-powered DT generator'
            style={{ flex: 1, width: '100%', border: 'none', background: '#0f1117' }}
          />
        </div>
      )}

      {activeTab === 'register' && me && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fade-in-up 0.5s ease-out' }}>

          {/* Progress indicator */}
          {(() => {
            const steps = [
              { label: 'Mode', at: 0 },
              { label: 'Configure', at: 2 },
              { label: 'Review', at: 3 },
              { label: 'Done', at: 4 },
            ]
            const activeIdx = steps.findIndex(s => s.at >= regStep)
            const currentIdx = activeIdx === -1 ? steps.length : activeIdx
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', padding: '.75rem 0' }}>
                {steps.map((s, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div style={{ width: 36, height: 2, background: i <= currentIdx ? T.accent : 'rgba(255,255,255,0.08)', borderRadius: 1 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem' }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.75rem', fontWeight: 600,
                        background: i < currentIdx ? 'rgba(16,185,129,0.4)' : i === currentIdx ? T.accentBg : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${i < currentIdx ? 'rgba(16,185,129,0.5)' : i === currentIdx ? T.accentBorder : 'rgba(255,255,255,0.08)'}`,
                        color: i <= currentIdx ? '#fff' : T.textMuted,
                      }}>{i < currentIdx ? '✓' : i + 1}</div>
                      <span style={{ fontSize: '.65rem', color: i <= currentIdx ? T.textSecondary : T.textMuted }}>{s.label}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )
          })()}

          {/* Step 0: Choose Mode */}
          {regStep === 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {/* Platform-hosted card */}
                <div onClick={() => { setRegMode('platform'); setRegStep(2) }} style={{
                  ...glass, padding: '2rem 1.75rem', cursor: 'pointer', borderTop: '3px solid rgba(99,102,241,0.4)',
                  transition: 'transform 0.2s', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: .7 }}>☁</div>
                  <h3 style={{ margin: '0 0 .75rem', fontSize: '1.05rem', color: T.textPrimary, fontWeight: 700 }}>Platform-Hosted</h3>
                  <p style={{ margin: 0, fontSize: '.87rem', color: T.textSecondary, lineHeight: 1.6 }}>
                    Upload your twin files or provide a GitHub repo. The platform builds and runs everything for you.
                  </p>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(99,102,241,0.15)', color: T.accent }}>File Upload</span>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(99,102,241,0.15)', color: T.accent }}>GitHub Import</span>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(99,102,241,0.15)', color: T.accent }}>Auto-Build</span>
                  </div>
                </div>

                {/* External card */}
                <div onClick={() => { setRegMode('external'); setRegStep(2) }} style={{
                  ...glass, padding: '2rem 1.75rem', cursor: 'pointer', borderTop: '3px solid rgba(16,185,129,0.4)',
                  transition: 'transform 0.2s', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: .7 }}>⇄</div>
                  <h3 style={{ margin: '0 0 .75rem', fontSize: '1.05rem', color: T.textPrimary, fontWeight: 700 }}>External / Self-Hosted</h3>
                  <p style={{ margin: 0, fontSize: '.87rem', color: T.textSecondary, lineHeight: 1.6 }}>
                    Your twin runs on your own infrastructure. Register it so the platform can discover, display, and receive its data.
                  </p>
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>Your Server</span>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>MQTT Bridge</span>
                    <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>Data Streams</span>
                  </div>
                </div>
              </div>

              {/* Template downloads */}
              <div style={{ ...glass, padding: '1.25rem 1.5rem' }}>
                <h4 style={{ ...miniHeading, marginTop: 0 }}>Starter Templates</h4>
                <p style={{ fontSize: '.83rem', color: T.textMuted, margin: '0 0 .75rem' }}>
                  Download these to bootstrap a new twin for platform hosting.
                </p>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {[
                    { name: 'twin.yaml', desc: 'Identity manifest' },
                    { name: 'compose.yaml', desc: 'Docker stack' },
                    { name: 'generator.py', desc: 'Data producer' },
                  ].map(t => (
                    <button key={t.name} onClick={() => downloadTemplate(t.name)} style={{ ...ghostBtn, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '.6rem 1rem' }}>
                      <span style={{ color: T.accent, fontWeight: 600, fontSize: '.85rem' }}>↓ {t.name}</span>
                      <span style={{ fontSize: '.72rem', color: T.textMuted }}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step 2: Platform-Hosted — unified flow */}
          {regStep === 2 && regMode === 'platform' && (
            <div style={{ ...glass, padding: '1.75rem 2rem' }}>
              <h3 style={{ ...subHeading, marginBottom: '.35rem' }}>☁ Platform-Hosted Twin</h3>
              <p style={{ fontSize: '.83rem', color: T.textMuted, margin: '0 0 1.5rem', lineHeight: 1.6 }}>
                Provide your project repo and Dockerfile. The platform wraps it with networking, data ingestion, and MQTT connectivity.
              </p>

              {/* ── 1. Twin Identity ─────────────────────────────────── */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, color: '#fff' }}>1</div>
                  <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: '.92rem' }}>Twin Identity</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
                  <div>
                    <label style={formLabel}>Twin Name *</label>
                    <input value={regForm.twin_name} onChange={e => setRegForm({ ...regForm, twin_name: e.target.value })}
                      placeholder='e.g. Building HVAC Monitor' style={glassInput} />
                  </div>
                  <div>
                    <label style={formLabel}>Domain Tags</label>
                    <input value={regForm.domain_tags} onChange={e => setRegForm({ ...regForm, domain_tags: e.target.value })}
                      placeholder='Energy, HVAC, Sensors' style={glassInput} />
                    <span style={{ fontSize: '.68rem', color: T.textMuted }}>Comma-separated</span>
                  </div>
                </div>
              </div>

              {/* ── 2. Project Repo ──────────────────────────────────── */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, color: '#fff' }}>2</div>
                  <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: '.92rem' }}>Project Repository</span>
                  <span style={{ fontSize: '.75rem', color: T.textMuted }}>— your code, configs, env files</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '.75rem', alignItems: 'center' }}>
                  {/* Zip upload */}
                  <div
                    onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setRegForm({ ...regForm, files: f, github_url: '' }) }}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      ...glass, padding: '1.25rem', textAlign: 'center', cursor: 'pointer',
                      border: `2px dashed ${regForm.files ? 'rgba(16,185,129,0.4)' : 'rgba(99,102,241,0.3)'}`, borderRadius: '12px',
                      background: regForm.files ? 'rgba(16,185,129,0.06)' : T.glassBg, minHeight: 90,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept=".zip,.tar.gz,.tgz" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files[0]; if (f) setRegForm({ ...regForm, files: f, github_url: '' }) }} />
                    {regForm.files ? (
                      <>
                        <div style={{ color: '#6ee7b7', fontWeight: 600, fontSize: '.88rem' }}>{regForm.files.name}</div>
                        <div style={{ fontSize: '.72rem', color: T.textMuted }}>{(regForm.files.size / 1024).toFixed(0)} KB</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '1.1rem', opacity: .4, marginBottom: '.2rem' }}>↑</div>
                        <div style={{ color: T.textSecondary, fontSize: '.82rem' }}>Upload .zip</div>
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: '.78rem', color: T.textMuted }}>or</span>
                  {/* GitHub URL */}
                  <div>
                    <input value={regForm.github_url} onChange={e => setRegForm({ ...regForm, github_url: e.target.value, files: null })}
                      placeholder='https://github.com/user/repo' style={glassInput} />
                    <span style={{ fontSize: '.68rem', color: T.textMuted }}>Public GitHub repository URL</span>
                  </div>
                </div>
              </div>

              {/* ── 3. Dockerfile ────────────────────────────────────── */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, color: '#fff' }}>3</div>
                  <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: '.92rem' }}>Docker Configuration</span>
                </div>
                <p style={{ fontSize: '.8rem', color: T.textMuted, margin: '0 0 .5rem', lineHeight: 1.5 }}>
                  Paste your Dockerfile or docker-compose.yaml. The platform will add its networking, MQTT bridge, and data ingestion layer on top.
                </p>
                <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                  <button onClick={() => setRegForm({ ...regForm, dockerfileType: 'dockerfile' })}
                    style={regForm.dockerfileType === 'dockerfile' ? glassBtn : ghostBtn}>Dockerfile</button>
                  <button onClick={() => setRegForm({ ...regForm, dockerfileType: 'compose' })}
                    style={regForm.dockerfileType === 'compose' ? glassBtn : ghostBtn}>docker-compose.yaml</button>
                </div>
                <textarea value={regForm.dockerfileText} onChange={e => setRegForm({ ...regForm, dockerfileText: e.target.value })}
                  placeholder={regForm.dockerfileType === 'dockerfile'
                    ? 'FROM python:3.11-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD ["python", "main.py"]'
                    : 'services:\n  app:\n    build: .\n    ports:\n      - "8000:8000"'}
                  style={{ ...glassInput, minHeight: 140, fontFamily: 'monospace', fontSize: '.8rem', lineHeight: 1.5, resize: 'vertical', whiteSpace: 'pre' }}
                  rows={8}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.75rem' }}>
                  <div>
                    <label style={formLabel}>Exposed Port</label>
                    <input value={regForm.exposedPort} onChange={e => setRegForm({ ...regForm, exposedPort: e.target.value })}
                      placeholder='e.g. 8000' style={glassInput} />
                    <span style={{ fontSize: '.68rem', color: T.textMuted }}>The port your service listens on (if it has a UI/API)</span>
                  </div>
                </div>
                <details style={{ marginTop: '.75rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '.82rem', color: T.accent, fontWeight: 600 }}>
                    What does the platform add?
                  </summary>
                  <div style={{ ...glass, padding: '1rem', marginTop: '.5rem', fontSize: '.8rem', color: T.textSecondary, lineHeight: 1.7 }}>
                    <div><strong style={{ color: T.textPrimary }}>Network</strong> — Connects your service to the platform's Docker network (MQTT broker, InfluxDB, other twins)</div>
                    <div><strong style={{ color: T.textPrimary }}>MQTT Bridge</strong> — Env vars <code style={codeStyle}>MQTT_BROKER_HOST</code>, <code style={codeStyle}>MQTT_BROKER_PORT</code> injected so your code can publish/subscribe</div>
                    <div><strong style={{ color: T.textPrimary }}>InfluxDB</strong> — Central and local InfluxDB credentials injected via env vars</div>
                    <div><strong style={{ color: T.textPrimary }}>twin.yaml</strong> — Identity manifest auto-generated and registered in the platform DTR</div>
                  </div>
                </details>
              </div>

              {/* ── 4. Information Fabric ────────────────────────────── */}
              <div style={{ marginBottom: '.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, color: '#fff' }}>4</div>
                  <span style={{ fontWeight: 700, color: T.textPrimary, fontSize: '.92rem' }}>Information Fabric</span>
                  <span style={{ fontSize: '.75rem', color: T.textMuted }}>— map your data streams</span>
                </div>
              </div>
              <FabricMapper />

              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.5rem' }}>
                <button onClick={() => { setRegStep(0); setRegMode(null) }} style={ghostBtn}>← Back</button>
                <button onClick={() => {
                  if (!regForm.twin_name.trim()) { setRegError('Twin name is required'); return }
                  if (!regForm.files && !regForm.github_url.trim()) { setRegError('Provide a repo zip or GitHub URL'); return }
                  setRegError(''); setRegStep(3)
                }} style={glassBtn}>Next →</button>
                {regError && <span style={{ fontSize: '.85rem', color: '#fca5a5', alignSelf: 'center' }}>{regError}</span>}
              </div>
            </div>
          )}


          {regStep === 2 && regMode === 'external' && (
            <div style={{ ...glass, padding: '1.75rem 2rem' }}>
              <h3 style={{ ...subHeading, marginBottom: '1.25rem' }}>⇄ External Twin Configuration</h3>

              {/* Identity */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={formLabel}>Twin Name *</label>
                  <input value={regForm.twin_name} onChange={e => setRegForm({ ...regForm, twin_name: e.target.value })}
                    placeholder='e.g. My Remote Sensor' style={glassInput} />
                </div>
                <div>
                  <label style={formLabel}>Domain Tags</label>
                  <input value={regForm.domain_tags} onChange={e => setRegForm({ ...regForm, domain_tags: e.target.value })}
                    placeholder='Sensors, IoT' style={glassInput} />
                  <span style={{ fontSize: '.68rem', color: T.textMuted }}>Comma-separated</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={formLabel}>External API / UI URL *</label>
                  <input value={regForm.external_api_url} onChange={e => setRegForm({ ...regForm, external_api_url: e.target.value })}
                    placeholder='https://your-server.com:3000' style={glassInput} />
                  <span style={{ fontSize: '.7rem', color: T.textMuted }}>The URL where your twin's dashboard or API is accessible</span>
                </div>
                <div>
                  <label style={formLabel}>MQTT Broker Host</label>
                  <input value={regForm.mqtt_broker_host} onChange={e => setRegForm({ ...regForm, mqtt_broker_host: e.target.value })}
                    placeholder='mqtt.yourserver.com' style={glassInput} />
                </div>
                <div>
                  <label style={formLabel}>MQTT Broker Port</label>
                  <input type='number' value={regForm.mqtt_broker_port} onChange={e => setRegForm({ ...regForm, mqtt_broker_port: parseInt(e.target.value) || 1883 })}
                    style={glassInput} />
                </div>
              </div>

              {/* MQTT Topics (dynamic list) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={formLabel}>MQTT Topics</label>
                {regForm.mqtt_topics.map((topic, i) => (
                  <div key={i} style={{ display: 'flex', gap: '.4rem', marginBottom: '.4rem' }}>
                    <input value={topic} onChange={e => {
                      const topics = [...regForm.mqtt_topics]; topics[i] = e.target.value
                      setRegForm({ ...regForm, mqtt_topics: topics })
                    }} placeholder='dtp/yourtwin/telemetry' style={{ ...glassInput, flex: 1 }} />
                    {regForm.mqtt_topics.length > 1 && (
                      <button onClick={() => {
                        const topics = regForm.mqtt_topics.filter((_, j) => j !== i)
                        setRegForm({ ...regForm, mqtt_topics: topics })
                      }} style={{ ...dangerBtn, padding: '.4rem .6rem' }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setRegForm({ ...regForm, mqtt_topics: [...regForm.mqtt_topics, ''] })}
                  style={{ ...smallBtn, marginTop: '.25rem' }}>+ Add Topic</button>
              </div>

              {/* Setup guide (collapsible) */}
              <details style={{ marginBottom: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '.85rem', color: T.accent, fontWeight: 600, marginBottom: '.75rem' }}>
                  Setup Guide — what to configure on your server
                </summary>
                <div style={{ ...glass, padding: '1.25rem', fontSize: '.83rem', color: T.textSecondary, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: T.textPrimary }}>1. CORS Headers</strong>
                    <p style={{ margin: '.25rem 0' }}>Add these headers to your API server so the platform UI can reach it:</p>
                    <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '.75rem', borderRadius: '8px', overflowX: 'auto', fontSize: '.78rem', color: '#94a3b8' }}>
{`Access-Control-Allow-Origin: ${window.location.origin}
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type`}</pre>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: T.textPrimary }}>2. MQTT Payload Format</strong>
                    <p style={{ margin: '.25rem 0' }}>Publish JSON payloads on your declared MQTT topics:</p>
                    <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '.75rem', borderRadius: '8px', overflowX: 'auto', fontSize: '.78rem', color: '#94a3b8' }}>
{`{
  "type": "telemetry",
  "twin_id": "dt:YourTwin_001",
  "ts": "2026-04-15T12:00:00Z",
  "data": { "temperature": 22.5, "humidity": 45 },
  "source": "your-twin-name"
}`}</pre>
                  </div>
                  <div>
                    <strong style={{ color: T.textPrimary }}>3. Health Endpoint (recommended)</strong>
                    <p style={{ margin: '.25rem 0' }}>
                      Expose <code style={codeStyle}>GET /health</code> returning <code style={codeStyle}>{`{"status":"ok"}`}</code> so the platform can monitor liveness.
                    </p>
                  </div>
                </div>
              </details>

              <FabricMapper />

              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.25rem' }}>
                <button onClick={() => { setRegStep(0); setRegMode(null) }} style={ghostBtn}>← Back</button>
                <button onClick={() => {
                  if (!regForm.twin_name.trim()) { setRegError('Twin name is required'); return }
                  if (!regForm.external_api_url.trim()) { setRegError('External API URL is required'); return }
                  setRegError(''); setRegStep(3)
                }} style={glassBtn}>Next →</button>
                {regError && <span style={{ fontSize: '.85rem', color: '#fca5a5', alignSelf: 'center' }}>{regError}</span>}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {regStep === 3 && (
            <div style={{ ...glass, padding: '1.75rem 2rem' }}>
              <h3 style={{ ...subHeading, marginBottom: '1.25rem' }}>Review & Submit</h3>
              <div style={{ display: 'grid', gap: '.6rem', marginBottom: '1.5rem' }}>
                {[
                  ['Mode', regMode === 'platform' ? '☁ Platform-Hosted' : '⇄ External / Self-Hosted'],
                  ['Twin Name', regForm.twin_name],
                  ['Twin ID', regForm.twin_id || `(auto: dt:${regForm.twin_name.replace(/\s+/g, '_')}_001)`],
                  ['Tenant', regForm.tenant],
                  ['Domain', regForm.domain_tags || '(none)'],
                  ...(regMode === 'platform' ? [
                    ['Source', regForm.github_url ? `GitHub: ${regForm.github_url}` : `Upload: ${regForm.files?.name || '—'}`],
                    ['Docker', regForm.dockerfileType === 'compose' ? 'docker-compose.yaml' : 'Dockerfile'],
                    ...(regForm.exposedPort ? [['Exposed Port', regForm.exposedPort]] : []),
                  ] : [
                    ['API URL', regForm.external_api_url],
                    ['MQTT Broker', regForm.mqtt_broker_host ? `${regForm.mqtt_broker_host}:${regForm.mqtt_broker_port}` : '(platform default)'],
                    ['MQTT Topics', regForm.mqtt_topics.filter(Boolean).join(', ') || '(none)'],
                  ]),
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', gap: '1rem', padding: '.5rem .75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <span style={{ minWidth: 110, fontSize: '.82rem', color: T.textMuted, fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '.88rem', color: T.textPrimary }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* ── Information Fabric: Read-only summary ──────────── */}
              {(() => {
                const hasFabric = Object.values(regForm.fabric).some(v => v.length > 0)
                if (!hasFabric) return null
                return (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '.82rem', color: T.textMuted, fontWeight: 600, marginBottom: '.5rem' }}>Information Fabric</div>
                    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                      {fabricCats.map(cat => (regForm.fabric[cat.key] || []).map((s, i) => (
                        <span key={`${cat.key}-${i}`} style={{
                          fontSize: '.75rem', padding: '.25rem .6rem', borderRadius: '6px',
                          background: `${cat.color}18`, border: `1px solid ${cat.color}35`, color: cat.color,
                        }}>
                          <strong>{cat.label}</strong>: {s.name || '(unnamed)'} ({s.protocol})
                        </span>
                      )))}
                    </div>
                  </div>
                )
              })()}

              {regError && <div style={{ fontSize: '.85rem', color: '#fca5a5', marginBottom: '.75rem', padding: '.5rem .75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>{regError}</div>}
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button onClick={() => setRegStep(2)} style={ghostBtn}>← Back</button>
                <button onClick={submitRegistration} disabled={regLoading} style={{ ...glassBtn, padding: '.6rem 2rem', opacity: regLoading ? .6 : 1 }}>
                  {regLoading ? 'Registering…' : 'Submit Registration'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Result with build status polling */}
          {regStep === 4 && regResult && (() => {
            const st = regResult.status
            const isBuilding = st === 'building' || st === 'validating'
            const isReady = st === 'ready'
            const isFailed = st === 'failed'

            return (
              <div style={{ ...glass, padding: '2rem' }}>
                {/* Status icon */}
                <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                  {isBuilding && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'orb-pulse 2s ease-in-out infinite' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTop: '2px solid #818cf8', animation: 'ring-spin 1.5s linear infinite' }} />
                    </div>
                  )}
                  {isReady && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.2)', border: '2px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '1.5rem' }}>✓</div>
                  )}
                  {isFailed && (
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', border: '2px solid rgba(239,68,68,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '1.5rem' }}>✗</div>
                  )}
                </div>

                <h3 style={{ margin: '0 0 .35rem', fontSize: '1.1rem', color: T.textPrimary, fontWeight: 700, textAlign: 'center' }}>
                  {isBuilding ? 'Building Twin...' : isReady ? 'Twin Built & Running' : 'Build Failed'}
                </h3>
                <p style={{ textAlign: 'center', fontSize: '.85rem', color: isReady ? T.textSecondary : isFailed ? '#fca5a5' : T.textMuted, margin: '0 0 1rem' }}>
                  {regResult.detail || regResult.message || regResult.error || ''}
                </p>

                {/* Twin info */}
                {regResult.twin_id && (
                  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '.82rem', color: T.textMuted }}>Twin ID: </span>
                    <code style={codeStyle}>{regResult.twin_id}</code>
                    {regResult.port && (
                      <span style={{ fontSize: '.82rem', color: T.textMuted, marginLeft: '.75rem' }}>Port: <code style={codeStyle}>{regResult.port}</code></span>
                    )}
                  </div>
                )}

                {/* Detected Docker files */}
                {regResult.detected_docker && (regResult.detected_docker.dockerfiles?.length > 0 || regResult.detected_docker.compose_files?.length > 0) && (
                  <div style={{ ...glass, padding: '.75rem 1rem', marginBottom: '.75rem', fontSize: '.8rem' }}>
                    <span style={{ color: T.textMuted, fontWeight: 600 }}>Detected in repo: </span>
                    {regResult.detected_docker.dockerfiles?.map(f => (
                      <span key={f} style={{ padding: '.1rem .4rem', background: 'rgba(99,102,241,0.15)', borderRadius: '4px', color: T.accent, marginRight: '.3rem' }}>{f}</span>
                    ))}
                    {regResult.detected_docker.compose_files?.map(f => (
                      <span key={f} style={{ padding: '.1rem .4rem', background: 'rgba(16,185,129,0.15)', borderRadius: '4px', color: '#6ee7b7', marginRight: '.3rem' }}>{f}</span>
                    ))}
                  </div>
                )}

                {/* Build log */}
                {(regResult.build_log || isBuilding) && (
                  <details open={isFailed} style={{ marginBottom: '1rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '.82rem', color: T.accent, fontWeight: 600 }}>
                      Build Log {isBuilding && <span style={{ animation: 'orb-pulse 1.5s infinite', fontSize: '.75rem' }}>(live)</span>}
                    </summary>
                    <pre style={{
                      background: 'rgba(0,0,0,0.4)', padding: '.75rem 1rem', borderRadius: '10px', marginTop: '.5rem',
                      fontSize: '.75rem', color: '#94a3b8', overflowX: 'auto', maxHeight: 300, overflowY: 'auto',
                      lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                      {regResult.build_log || (isBuilding ? 'Waiting for build output...' : '(no log yet)')}
                    </pre>
                  </details>
                )}

                {/* Generated files */}
                {regResult.generated_files && (
                  <div style={{ fontSize: '.78rem', color: T.textMuted, marginBottom: '1rem', textAlign: 'center' }}>
                    Generated: {regResult.generated_files.join(', ')}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
                  {isReady && (
                    <>
                      <button onClick={() => { setActiveTab('twins'); regReset() }} style={glassBtn}>View Twins</button>
                      <button onClick={regReset} style={ghostBtn}>Register Another</button>
                    </>
                  )}
                  {isFailed && (
                    <>
                      <button onClick={() => { setRegStep(2); setRegResult(null); setRegError('') }} style={ghostBtn}>← Edit & Retry</button>
                      <button onClick={regReset} style={ghostBtn}>Start Over</button>
                    </>
                  )}
                  {isBuilding && (
                    <span style={{ fontSize: '.82rem', color: T.textMuted }}>Build in progress — this page auto-refreshes...</span>
                  )}
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {/* ── API reference ──────────────────────────────────────────────── */}
      <div style={{ marginTop: '1.25rem' }}>
        <button type='button' onClick={() => setShowApi(!showApi)} style={ghostBtn}>
          {showApi ? '▲ Hide API reference' : '▼ Show API reference'}
        </button>
        {showApi && (
          <pre style={{
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            color: '#94a3b8', padding: '1.1rem 1.25rem', borderRadius: '12px', overflowX: 'auto',
            marginTop: '.6rem', fontSize: '.82rem', lineHeight: 1.7,
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
{`GET  ${apiBase}/api/me/twins/
GET  ${apiBase}/api/registry/services/list?scope=mine
GET  ${apiBase}/api/registry/twins?scope=mine
POST ${apiBase}/api/admin/grants  {"username":"demo@example.com","twin_id":"..."}`}
          </pre>
        )}
      </div>

    </div>
  )
}

// ─── Shared style objects ─────────────────────────────────────────────────────
const formLabel       = { display: 'block', fontSize: '.78rem', color: 'rgba(255,255,255,0.45)', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }
const sectionHeading = { margin: '0 0 1rem', fontSize: '1.1rem', color: '#f0f4f8', fontWeight: 700, letterSpacing: '.01em' }
const subHeading     = { margin: '0 0 .75rem', fontSize: '.95rem', color: '#f0f4f8', fontWeight: 600 }
const miniHeading    = { margin: '.25rem 0 .4rem', fontSize: '.82rem', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }
const listStyle      = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }
const listItemStyle  = { display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.85rem', padding: '.4rem .6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }
const codeStyle      = { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', padding: '.05rem .4rem', fontSize: '.8em', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }
const adminPill      = { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '9999px', padding: '.1rem .45rem', fontSize: '.72rem', color: '#818cf8' }
const linkBtn        = { display: 'inline-block', background: 'rgba(99,102,241,0.45)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '8px', color: '#fff', padding: '.4rem .9rem', textDecoration: 'none', fontSize: '.85rem', fontWeight: 500 }
