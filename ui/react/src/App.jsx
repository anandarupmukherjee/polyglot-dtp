import React, { useEffect, useState } from 'react'

const apiBase = import.meta.env.VITE_API_BASE || ''
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
  const [activeTab, setActiveTab] = useState('twins')
  const [showApi, setShowApi] = useState(false)

  const [admin, setAdmin] = useState({ users: [], twins: [], grants: [], services: [], serviceGrants: [] })
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '' })
  const [newTwin, setNewTwin] = useState({ name: '', ui_url: '', dtr_id: '' })
  const [newGrant, setNewGrant] = useState({ username: '', twin_id: '' })
  const [newServiceGrant, setNewServiceGrant] = useState({ username: '', service_id: '' })
  const [adminSection, setAdminSection] = useState('users')

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
  if (me?.is_staff) navItems.push({ key: 'admin', label: 'Admin', icon: '⚙' })

  const ScopeToggle = ({ onMine, onAll }) => (
    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginBottom: '.75rem' }}>
      <span style={{ fontSize: '.8rem', color: T.textMuted, marginRight: '.25rem' }}>Scope</span>
      <button type='button' onClick={onMine} style={scope === 'mine' ? glassBtn : ghostBtn}>Mine</button>
      <button type='button' onClick={onAll}  style={scope === 'all'  ? glassBtn : ghostBtn}>All</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.25rem' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        ...glass,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1rem 1.5rem', marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'linear-gradient(135deg, #818cf8, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
          }}>⬡</div>
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
        <div style={{ ...glassCard, maxWidth: 440 }}>
          <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.2rem', color: T.textPrimary, fontWeight: 700 }}>Sign In</h2>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '.25rem' }}>
              <button onClick={login} style={{ ...glassBtn, padding: '.55rem 1.5rem' }}>Login</button>
              {status && (
                <span style={{ fontSize: '.85rem', color: status.startsWith('Login failed') ? '#fca5a5' : '#6ee7b7' }}>
                  {status}
                </span>
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
              {twins.map(t => {
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
