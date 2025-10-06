import React, { useEffect, useState } from 'react'

const apiBase = import.meta.env.VITE_API_BASE || ''
const tokenKey = 'dtp_token'
const refreshKey = 'dtp_refresh'

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
  } catch (err) {
    /* ignore */
  }
  return null
}

async function authFetch(url, init = {}) {
  const t = localStorage.getItem(tokenKey)
  const headers = new Headers(init.headers || {})
  if (t) {
    headers.set('Authorization', `Bearer ${t}`)
  }
  let res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    const newTok = await refreshAccessToken()
    if (newTok) {
      const headers2 = new Headers(init.headers || {})
      headers2.set('Authorization', `Bearer ${newTok}`)
      res = await fetch(url, { ...init, headers: headers2 })
    }
  }
  return res
}

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

  const login = async () => {
    setStatus('Signing in...')
    try {
      const res = await fetch(`${apiBase}/api/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password: pw })
      })
      if (!res.ok) {
        const msg = await safeText(res)
        setStatus(`Login failed${msg ? `: ${msg}` : ''}`)
        return
      }
      const data = await res.json()
      if (!data || !data.access) {
        setStatus('Login failed: no token')
        return
      }
      if (data.refresh) {
        localStorage.setItem(refreshKey, data.refresh)
      }
      localStorage.setItem(tokenKey, data.access)
      setStatus('Signed in')
      setActiveTab('twins')
      await Promise.all([loadMe(), loadTwins(), loadServices(), loadRegistryTwins(), loadLastData()])
    } catch (err) {
      setStatus('Login failed: network/CORS error')
      console.error('login error', err)
    }
  }

  const safeText = async (res) => {
    try { return await res.text() } catch { return '' }
  }

  const loadTwins = async () => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setTwins([]); return }
    const res = await authFetch(`${apiBase}/api/me/twins/`)
    if (!res.ok) { setTwins([]); return }
    setTwins(await res.json())
  }

  const loadServices = async () => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setServices([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await authFetch(`${apiBase}/api/registry/services/list?scope=${encodeURIComponent(s)}`)
    if (!res.ok) { setServices([]); return }
    setServices(await res.json())
  }

  const loadRegistryTwins = async () => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setRegistryTwins([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await authFetch(`${apiBase}/api/registry/twins?scope=${encodeURIComponent(s)}`)
    if (!res.ok) { setRegistryTwins([]); return }
    setRegistryTwins(await res.json())
  }

  const loadLastData = async () => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setLastData({}); return }
    const res = await authFetch(`${apiBase}/api/last-data/my`)
    if (!res.ok) { setLastData({}); return }
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data.items || [])
    const map = {}
    items.forEach(it => { if (it?.twin_id) { map[it.twin_id] = { ts: it.last_ts || null, source: it.source || null } } })
    setLastData(map)
  }

  const loadMe = async () => {
    const token = localStorage.getItem(tokenKey)
    if (!token) { setMe(null); return }
    const res = await authFetch(`${apiBase}/api/me/`)
    if (!res.ok) { setMe(null); return }
    const info = await res.json()
    setMe(info)
    if (info.is_staff) {
      await loadAdmin()
    }
  }

  const loadHealth = async () => {
    try {
      const res = await fetch(`${apiBase}/api/healthz`)
      if (!res.ok) return
      setHealth(await res.json())
    } catch (err) {
      /* ignore */
    }
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
    const res = await authFetch(`${apiBase}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    })
    if (res.ok) {
      setNewUser({ username: '', email: '', password: '' })
      await loadAdmin()
    }
  }

  const deleteUser = async (username) => {
    if (!confirm(`Delete user ${username}?`)) return
    await authFetch(`${apiBase}/api/admin/users`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })
    await loadAdmin()
  }

  const createTwin = async () => {
    const res = await authFetch(`${apiBase}/api/admin/twins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTwin)
    })
    if (res.ok) {
      setNewTwin({ name: '', ui_url: '', dtr_id: '' })
      await loadAdmin()
    }
  }

  const deleteTwin = async (twin_id) => {
    if (!confirm(`Delete twin ${twin_id}?`)) return
    await authFetch(`${apiBase}/api/admin/twins`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twin_id })
    })
    await loadAdmin()
  }

  const createGrant = async () => {
    const res = await authFetch(`${apiBase}/api/admin/grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGrant)
    })
    if (res.ok) {
      setNewGrant({ username: '', twin_id: '' })
      await loadAdmin()
    }
  }

  const deleteGrant = async (username, twin_id) => {
    if (!confirm(`Remove grant ${username} -> ${twin_id}?`)) return
    await authFetch(`${apiBase}/api/admin/grants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, twin_id })
    })
    await loadAdmin()
  }

  const createServiceGrant = async () => {
    const res = await authFetch(`${apiBase}/api/admin/service-grants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newServiceGrant)
    })
    if (res.ok) {
      setNewServiceGrant({ username: '', service_id: '' })
      await loadAdmin()
    }
  }

  const deleteServiceGrant = async (username, service_id) => {
    if (!confirm(`Remove service grant ${username} -> ${service_id}?`)) return
    await authFetch(`${apiBase}/api/admin/service-grants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, service_id })
    })
    await loadAdmin()
  }

  const scanTwins = async () => {
    setStatus('Scanning repo for twins...')
    try {
      const res = await authFetch(`${apiBase}/api/admin/scan`, { method: 'POST' })
      if (res.ok) {
        setStatus('Scan complete')
        await Promise.all([loadRegistryTwins(), loadTwins(), loadAdmin()])
      } else {
        const err = await res.json().catch(() => ({}))
        setStatus(`Scan failed${err?.error ? ': ' + err.error : ''}`)
      }
    } catch (err) {
      setStatus('Scan error')
    }
  }

  useEffect(() => { loadTwins() }, [])
  useEffect(() => { loadServices() }, [])

  useEffect(() => {
    const id = setInterval(() => { refreshAccessToken().catch(() => null) }, 9 * 60 * 1000)
    const hasAccess = !!localStorage.getItem(tokenKey)
    const hasRefresh = !!localStorage.getItem(refreshKey)
    if (hasAccess) {
      loadMe(); loadTwins(); loadServices(); loadRegistryTwins(); loadLastData()
    } else if (hasRefresh) {
      refreshAccessToken()
        .then(() => { loadMe(); loadTwins(); loadServices(); loadRegistryTwins(); loadLastData() })
        .catch(() => null)
    }
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
      try {
        const msg = JSON.parse(ev.data)
        if (msg && msg.type && msg.type.startsWith('twin.')) {
          loadRegistryTwins(); loadTwins(); loadLastData()
        }
      } catch (err) {
        /* ignore */
      }
    }
    es.onerror = () => { try { es.close() } catch (err) { /* ignore */ } }
    return () => { try { es.close() } catch (err) { /* ignore */ } }
  }, [me])

  useEffect(() => {
    if (me) {
      loadServices()
      loadRegistryTwins()
    }
  }, [scope])

  const navItems = [
    { key: 'twins', label: 'Twins' },
    { key: 'services', label: 'Services' },
    { key: 'registry', label: 'DTR' },
  ]
  if (me?.is_staff) {
    navItems.push({ key: 'admin', label: 'Admin' })
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', margin: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <span style={{ fontWeight: 600 }}>DTP Portal</span>
        {me ? (
          <span style={{ fontSize: '.9em', color: '#334155' }}>
            {me.username}
            <button
              type='button'
              onClick={() => {
                localStorage.removeItem(tokenKey)
                localStorage.removeItem(refreshKey)
                setMe(null)
                setTwins([])
                setServices([])
                setRegistryTwins([])
                setAdmin({ users: [], twins: [], grants: [], services: [], serviceGrants: [] })
                setStatus('')
              }}
              style={{ marginLeft: '.75rem' }}
            >Logout</button>
          </span>
        ) : null}
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', margin: '.25rem 0' }}>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: '1px solid #e2e8f0', background: '#f1f5f9', color: '#334155' }}>
          <strong>Backend</strong>: <code>{apiBase || window.location.origin}</code>
        </span>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: (health.ok ? '1px solid #86efac' : '1px solid #fecaca'), background: (health.ok ? '#dcfce7' : '#fee2e2'), color: (health.ok ? '#166534' : '#991b1b') }}>
          <strong>Health</strong>: {health.ok ? 'OK' : 'Down'}
        </span>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: (health.db ? '1px solid #86efac' : '1px solid #fecaca'), background: (health.db ? '#dcfce7' : '#fee2e2'), color: (health.db ? '#166534' : '#991b1b') }}>
          <strong>DB</strong>: {health.db ? 'OK' : 'ERR'}
        </span>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: (health.influx_configured ? '1px solid #86efac' : '1px solid #fecaca'), background: (health.influx_configured ? '#dcfce7' : '#fee2e2'), color: (health.influx_configured ? '#166534' : '#991b1b') }}>
          <strong>Influx</strong>: {health.influx_configured ? 'Yes' : 'No'}
        </span>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: (health.cron ? '1px solid #86efac' : '1px solid #e2e8f0'), background: (health.cron ? '#dcfce7' : '#f1f5f9'), color: (health.cron ? '#166534' : '#334155') }}>
          <strong>Cron</strong>: {health.cron ? 'ON' : 'OFF'}
        </span>
        <span style={{ fontSize: '.85em', padding: '.2rem .5rem', borderRadius: '9999px', border: '1px solid #e2e8f0', background: '#f1f5f9', color: '#334155' }}>
          <strong>Updated</strong>: {health.ts || '-'}
        </span>
      </div>

      {!me && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
          <h2>Login</h2>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder='email' />
          <input type='password' value={pw} onChange={e => setPw(e.target.value)} placeholder='password' style={{ marginLeft: '.5rem' }} />
          <button onClick={login} style={{ marginLeft: '.5rem' }}>Login</button>
          <span style={{ marginLeft: '.5rem', color: '#2563eb' }}>{status}</span>
        </div>
      )}

      {me && (
        <nav style={{ display: 'flex', gap: '.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
          {navItems.map(item => (
            <button
              key={item.key}
              type='button'
              onClick={() => setActiveTab(item.key)}
              style={{
                padding: '.5rem 1rem',
                borderRadius: 6,
                border: activeTab === item.key ? '2px solid #2563eb' : '1px solid #cbd5f5',
                background: activeTab === item.key ? '#2563eb' : '#e2e8f0',
                color: activeTab === item.key ? '#fff' : '#334155',
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div style={{ display: activeTab === 'twins' ? 'block' : 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>Your Twins</h2>
        {!me ? (
          <em>Sign in to view your granted twins.</em>
        ) : twins.length === 0 ? (
          <em>No twins granted yet.</em>
        ) : (
          twins.map(t => {
            const match = registryTwins.find(rt => rt.twin_id === t.dtr_id) || registryTwins.find(rt => (rt.interfaces && rt.interfaces.api) === t.ui_url)
            const ld = (match && lastData && lastData[match.twin_id]) || null
            const lastTs = ld && typeof ld === 'object' ? ld.ts : null
            const last = lastTs ? new Date(lastTs) : null
            const lastLabel = last && !Number.isNaN(last.getTime()) ? last.toLocaleString() : null
            return (
              <div key={t.twin_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
                <strong>{t.name}</strong><br />
                <a href={t.ui_url} target='_blank' rel='noopener' style={btnStyle}>Open UI</a>
                <div style={{ marginTop: '.35rem', fontSize: '.85em', color: '#475569' }}>
                  {lastLabel ? `Last data: ${lastLabel}` : 'Last data: unknown'}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ display: activeTab === 'services' ? 'block' : 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>My Services</h2>
        {me?.is_staff && (
          <div style={{ marginBottom: '.5rem' }}>
            <label>Scope: </label>
            <button type='button' onClick={() => { setScope('mine'); loadServices(); }} disabled={scope === 'mine'}>Mine</button>
            <button type='button' onClick={() => { setScope('all'); loadServices(); }} disabled={scope === 'all'} style={{ marginLeft: '.5rem' }}>All</button>
            <button type='button' onClick={() => loadServices()} style={{ marginLeft: '.75rem' }}>Refresh</button>
          </div>
        )}
        {!me ? (
          <em>Sign in to view services.</em>
        ) : services.length === 0 ? (
          <em>No services available.</em>
        ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {services.map(s => {
              const api = s.interfaces?.api || ''
              const svcHealth = s.health || ''
              return (
                <div key={s.id || s.name} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
                  <strong>{s.name}</strong>
                  <div style={{ marginTop: '.35rem', fontSize: '.9em', color: '#475569' }}>
                    <div>Category: {s.category || '-'}</div>
                    {svcHealth ? <div>Health: <code>{svcHealth}</code></div> : null}
                  </div>
                  {api ? (
                    <a href={api} target='_blank' rel='noopener' style={btnStyle}>Open Service</a>
                  ) : (
                    <span style={{ display: 'inline-block', marginTop: '.5rem', color: '#94a3b8' }}>No UI URL</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: activeTab === 'registry' ? 'block' : 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>My Registry Twins (DTR)</h2>
        {!me ? (
          <em>Sign in to explore the registry.</em>
        ) : (
          <>
            {me?.is_staff && (
              <div>
                <label>Scope: </label>
                <button type='button' onClick={() => { setScope('mine'); loadRegistryTwins(); loadServices(); }} disabled={scope === 'mine'}>Mine</button>
                <button type='button' onClick={() => { setScope('all'); loadRegistryTwins(); loadServices(); }} disabled={scope === 'all'} style={{ marginLeft: '.5rem' }}>All</button>
                <button type='button' onClick={() => { loadRegistryTwins(); loadServices(); }} style={{ marginLeft: '.75rem' }}>Refresh</button>
              </div>
            )}
            <ul>
              {registryTwins.map(t => {
                const ld = lastData[t.twin_id] || null
                const lastTs = ld && typeof ld === 'object' ? ld.ts : null
                const last = lastTs ? new Date(lastTs) : null
                const lastLabel = last && !Number.isNaN(last.getTime()) ? last.toLocaleString() : null
                const sourceLabel = ld && typeof ld === 'object' && ld.source ? ld.source : null
                return (
                  <li key={t.twin_id} style={{ marginTop: '.5rem' }}>
                    <strong>{t.twin_id}</strong> {t.metadata?.status ? `(${t.metadata.status})` : ''}
                    <div style={{ fontSize: '.9em', color: '#334155' }}>
                      <div>API: <code>{t.interfaces?.api || '-'}</code></div>
                      <div>Streams: {(t.interfaces?.data_streams || []).join(', ') || '-'}</div>
                      <div>Domain: {(t.metadata?.domain || []).join(', ') || '-'}</div>
                      <div>Last data: {lastLabel || 'unknown'}{sourceLabel ? ` - source: ${sourceLabel}` : ''}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {activeTab === 'admin' && me?.is_staff && (
        <div style={{ border: '2px solid #94a3b8', borderRadius: 8, padding: '1rem', margin: '.5rem 0', background: '#f8fafc' }}>
          <h2>Admin</h2>
          <div style={{ marginBottom: '.5rem' }}>
            <button onClick={scanTwins}>Scan repo for twins</button>
            <span style={{ marginLeft: '.75rem', color: '#2563eb' }}>{status}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div>
              <h3>Users</h3>
              <div>
                <input placeholder='username/email' value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} />
                <input placeholder='email' value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <input placeholder='password' value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <button onClick={createUser} style={{ marginLeft: '.5rem' }}>Create</button>
              </div>
              <ul>
                {admin.users.map(u => (
                  <li key={u.id}>
                    {u.username} {u.is_staff ? '(admin)' : ''}
                    <button onClick={() => deleteUser(u.username)} style={{ marginLeft: '.5rem' }}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Twins & Grants</h3>
              <div>
                <input placeholder='name' value={newTwin.name} onChange={e => setNewTwin({ ...newTwin, name: e.target.value })} />
                <input placeholder='ui_url' value={newTwin.ui_url} onChange={e => setNewTwin({ ...newTwin, ui_url: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <input placeholder='dtr_id' value={newTwin.dtr_id} onChange={e => setNewTwin({ ...newTwin, dtr_id: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <button onClick={createTwin} style={{ marginLeft: '.5rem' }}>Create</button>
              </div>
              <div style={{ marginTop: '.75rem' }}>
                <h4 style={{ margin: '.25rem 0' }}>Existing Twin Cards</h4>
                <ul>
                  {(admin.twins || []).map(t => (
                    <li key={t.twin_id} style={{ marginTop: '.35rem' }}>
                      <strong>{t.name}</strong> - UI: <code>{t.ui_url}</code> {t.dtr_id ? `- DTR: ${t.dtr_id}` : ''} - id: <code>{t.twin_id}</code>
                      <button onClick={() => deleteTwin(t.twin_id)} style={{ marginLeft: '.5rem' }}>Delete</button>
                      <button onClick={() => setNewGrant({ ...newGrant, twin_id: t.twin_id })} style={{ marginLeft: '.5rem' }}>Use ID</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: '.5rem' }}>
                <input placeholder='username' value={newGrant.username} onChange={e => setNewGrant({ ...newGrant, username: e.target.value })} />
                <input placeholder='twin_id' value={newGrant.twin_id} onChange={e => setNewGrant({ ...newGrant, twin_id: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <button onClick={createGrant} style={{ marginLeft: '.5rem' }}>Grant</button>
              </div>
              <div style={{ marginTop: '.75rem' }}>
                <h4>Current Twin Grants</h4>
                <ul>
                  {(admin.grants || []).map(g => (
                    <li key={`${g.user}::${g.twin_id}`}>
                      {g.user} -> {g.twin} <code>({g.twin_id})</code>
                      <button onClick={() => deleteGrant(g.user, g.twin_id)} style={{ marginLeft: '.5rem' }}>Revoke</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <h3>Services & Grants</h3>
              <div>
                <input placeholder='username' value={newServiceGrant.username} onChange={e => setNewServiceGrant({ ...newServiceGrant, username: e.target.value })} />
                <input placeholder='service_id' value={newServiceGrant.service_id} onChange={e => setNewServiceGrant({ ...newServiceGrant, service_id: e.target.value })} style={{ marginLeft: '.5rem' }} />
                <button onClick={createServiceGrant} style={{ marginLeft: '.5rem' }}>Grant</button>
              </div>
              <div style={{ marginTop: '.75rem' }}>
                <h4 style={{ margin: '.25rem 0' }}>Available Services</h4>
                <ul>
                  {(admin.services || []).map(s => (
                    <li key={s.id || s.name} style={{ marginTop: '.35rem' }}>
                      <strong>{s.name}</strong> ({s.category || '-'})
                      <button onClick={() => setNewServiceGrant({ username: newServiceGrant.username, service_id: s.id })} style={{ marginLeft: '.5rem' }}>Use ID</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: '.75rem' }}>
                <h4>Current Service Grants</h4>
                <ul>
                  {(admin.serviceGrants || []).map(g => (
                    <li key={`${g.user}::${g.service_id}`}>
                      {g.user} -> {g.service} <code>({g.service_id})</code>
                      <button onClick={() => deleteServiceGrant(g.user, g.service_id)} style={{ marginLeft: '.5rem' }}>Revoke</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button type='button' onClick={() => setShowApi(!showApi)} style={{ marginRight: '.75rem' }}>
          {showApi ? 'Hide API reference' : 'Show API reference'}
        </button>
        {showApi && (
          <pre style={{ background: '#0f172a', color: '#f8fafc', padding: '1rem', borderRadius: 8, overflowX: 'auto', marginTop: '.75rem' }}>
{`GET ${apiBase}/api/me/twins/\nGET ${apiBase}/api/registry/services/list?scope=mine\nGET ${apiBase}/api/registry/twins?scope=mine\nPOST ${apiBase}/api/admin/grants {"username":"demo@example.com","twin_id":"..."}`}
          </pre>
        )}
      </div>
    </div>
  )
}

const btnStyle = { display: 'inline-block', marginTop: '.5rem', background: '#2563eb', color: '#fff', padding: '.5rem .75rem', borderRadius: 6, textDecoration: 'none' }
