import React, { useEffect, useState } from 'react'

const apiBase = import.meta.env.VITE_API_BASE || ''
const tokenKey = 'dtp_token'

export default function App(){
  const [email, setEmail] = useState('demo@example.com')
  const [pw, setPw] = useState('demo12345')
  const [status, setStatus] = useState('')
  const [me, setMe] = useState(null)
  const [admin, setAdmin] = useState({ users: [], twins: [], grants: [] })
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '' })
  const [newTwin, setNewTwin] = useState({ name: '', ui_url: '', dtr_id: '' })
  const [newGrant, setNewGrant] = useState({ username: '', twin_id: '' })
  const [twins, setTwins] = useState([])
  const [registryTwins, setRegistryTwins] = useState([])
  const [services, setServices] = useState([])
  const [scope, setScope] = useState('mine') // staff-only toggle
  const [lastData, setLastData] = useState({})
  const [health, setHealth] = useState({ ok: false, db: false, influx_configured: false, cron: false, ts: '' })

  const login = async () => {
    setStatus('Signing in...')
    try {
      const res = await fetch(`${apiBase}/api/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password: pw })
      })
      if(!res.ok){
        const msg = await safeText(res)
        setStatus(`Login failed${msg ? `: ${msg}` : ''}`)
        return
      }
      const data = await res.json()
      if(!data || !data.access){
        setStatus('Login failed: no token')
        return
      }
      localStorage.setItem(tokenKey, data.access)
      setStatus('Signed in')
      await Promise.all([loadMe(), loadTwins(), loadRegistryTwins(), loadServices(), loadLastData()])
    } catch (err) {
      setStatus('Login failed: network/CORS error')
      // eslint-disable-next-line no-console
      console.error('login error', err)
    }
  }

  const safeText = async (res) => {
    try { return await res.text() } catch { return '' }
  }

  const loadTwins = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setTwins([]); return }
    const res = await fetch(`${apiBase}/api/me/twins/`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setTwins([]); return }
    const list = await res.json()
    setTwins(list)
  }

  useEffect(() => { loadTwins() }, [])

  const loadRegistryTwins = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setRegistryTwins([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await fetch(`${apiBase}/api/registry/twins?scope=${encodeURIComponent(s)}`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setRegistryTwins([]); return }
    const list = await res.json()
    setRegistryTwins(list)
  }
  const loadServices = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setServices([]); return }
    const s = (me && me.is_staff) ? scope : 'mine'
    const res = await fetch(`${apiBase}/api/registry/services/list?scope=${encodeURIComponent(s)}`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setServices([]); return }
    const list = await res.json()
    setServices(list)
  }
  const loadLastData = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setLastData({}); return }
    const res = await fetch(`${apiBase}/api/last-data/my`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setLastData({}); return }
    const data = await res.json()
    const map = {}
    ;(data.items||[]).forEach(it => { map[it.twin_id] = { ts: it.last_ts || null, source: it.source || null } })
    setLastData(map)
  }
  const loadMe = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setMe(null); return }
    const res = await fetch(`${apiBase}/api/me/`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setMe(null); return }
    const info = await res.json()
    setMe(info)
    if(info.is_staff){ await loadAdmin() }
    await Promise.all([loadRegistryTwins(), loadServices(), loadLastData()])
  }

  const loadAdmin = async () => {
    const token = localStorage.getItem(tokenKey)
    const [u,t,g] = await Promise.all([
      fetch(`${apiBase}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():[]),
      fetch(`${apiBase}/api/admin/twins`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():[]),
      fetch(`${apiBase}/api/admin/grants`, { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.ok?r.json():[]),
    ])
    setAdmin({ users: u, twins: t, grants: g })
  }

  const createUser = async () => {
    const token = localStorage.getItem(tokenKey)
    const res = await fetch(`${apiBase}/api/admin/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newUser) })
    if(res.ok){ setNewUser({ username: '', email: '', password: '' }); await loadAdmin() }
  }
  const deleteUser = async (username) => {
    if(!confirm(`Delete user ${username}?`)) return
    const token = localStorage.getItem(tokenKey)
    await fetch(`${apiBase}/api/admin/users`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ username }) })
    await loadAdmin()
  }
  const createTwin = async () => {
    const token = localStorage.getItem(tokenKey)
    const res = await fetch(`${apiBase}/api/admin/twins`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newTwin) })
    if(res.ok){ setNewTwin({ name: '', ui_url: '', dtr_id: '' }); await loadAdmin() }
  }

  const loadHealth = async () => {
    try{
      const res = await fetch(`${apiBase}/api/healthz`)
      if(!res.ok) return
      const h = await res.json()
      setHealth(h)
    }catch(err){ /* ignore */ }
  }
  const deleteTwin = async (twin_id) => {
    if(!confirm(`Delete twin ${twin_id}?`)) return
    const token = localStorage.getItem(tokenKey)
    await fetch(`${apiBase}/api/admin/twins`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ twin_id }) })
    await loadAdmin()
  }
  const createGrant = async () => {
    const token = localStorage.getItem(tokenKey)
    const res = await fetch(`${apiBase}/api/admin/grants`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newGrant) })
    if(res.ok){ setNewGrant({ username: '', twin_id: '' }); await loadAdmin() }
  }
  const deleteGrant = async (username, twin_id) => {
    if(!confirm(`Remove grant ${username} -> ${twin_id}?`)) return
    const token = localStorage.getItem(tokenKey)
    await fetch(`${apiBase}/api/admin/grants`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ username, twin_id }) })
    await loadAdmin()
  }

  const scanTwins = async () => {
    const token = localStorage.getItem(tokenKey)
    setStatus('Scanning repo for twins...')
    try{
      const res = await fetch(`${apiBase}/api/admin/scan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if(res.ok){
        setStatus('Scan complete')
        await loadRegistryTwins(); await loadTwins(); await loadAdmin()
      } else {
        const err = await res.json().catch(()=>({}))
        setStatus(`Scan failed${err?.error?': '+err.error:''}`)
      }
    }catch(e){ setStatus('Scan error') }
  }

  const [showApi, setShowApi] = useState(false)
  useEffect(() => {
    // open SSE for registry/portal updates (tenant is determined server-side)
    const token = localStorage.getItem(tokenKey)
    if(!token) return
    const es = new EventSource(`${apiBase}/api/portal/stream`, { withCredentials: false })
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if(msg && msg.type && msg.type.startsWith('twin.')){
          loadRegistryTwins(); loadTwins(); loadLastData()
        }
      } catch {}
    }
    es.onerror = () => { try { es.close() } catch(e){} }
    return () => { try { es.close() } catch(e){} }
  }, [me])

  useEffect(() => {
    loadHealth()
    const id = setInterval(loadHealth, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', margin: '2rem' }}>
      {me && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '.75rem' }}>
          <div style={{ fontWeight: 600 }}>DTP Portal</div>
          <div style={{ fontSize: '.9em', color: '#334155' }}>
            {me.username}
            <button type='button' onClick={() => { localStorage.removeItem(tokenKey); setMe(null); setTwins([]); setRegistryTwins([]); setServices([]); setAdmin({ users: [], twins: [], grants: [] }); setStatus(''); }} style={{ marginLeft: '.75rem' }}>Logout</button>
          </div>
        </div>
      )}
      <h1 style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span>DTP Portal</span>
        {me && (
          <span style={{ fontSize: '.9em', color: '#334155' }}>
            {me.username} <button type='button' onClick={() => { localStorage.removeItem(tokenKey); setMe(null); setTwins([]); setRegistryTwins([]); setServices([]); setAdmin({ users: [], twins: [], grants: [] }); setStatus(''); }}>Logout</button>
          </span>
        )}
      </h1>
      <div style={{ display: 'none' }}>
        Backend: <code>{apiBase}</code> Â· Health: {health.ok ? 'OK' : 'Down'} Â· DB: {health.db ? 'OK' : 'ERR'} Â· Influx cfg: {health.influx_configured ? 'Yes' : 'No'} {health.cron ? 'Â· cron ON' : ''} Â· Updated: {health.ts || '-'}
      </div>
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
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>Login</h2>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder='email' />
        <input type='password' value={pw} onChange={e => setPw(e.target.value)} placeholder='password' style={{ marginLeft: '.5rem' }} />
        <button onClick={login} style={{ marginLeft: '.5rem' }}>Login</button>
        <span style={{ marginLeft: '.5rem', color: '#2563eb' }}>{status}</span>
      </div>
      {me && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
          <h2>Your Twins</h2>
          {twins.length === 0 ? <em>No twins</em> : twins.map(t => {
           // find matching DTR entry by dtr_id or api url
           const match = registryTwins.find(rt => rt.twin_id === t.dtr_id) || registryTwins.find(rt => (rt.interfaces && rt.interfaces.api) === t.ui_url)
           const ld = (match && lastData && lastData[match.twin_id]) || null
           const last = ld ? new Date((ld.ts !== undefined ? ld.ts : ld)).toLocaleString() : null
           return (
             <div key={t.twin_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
               <strong>{t.name}</strong><br />
               <a href={t.ui_url} target='_blank' rel='noopener' style={{ display: 'inline-block', marginTop: '.5rem', background: '#2563eb', color: '#fff', padding: '.5rem .75rem', borderRadius: 6, textDecoration: 'none' }}>Open UI</a>
               <div style={{ marginTop: '.35rem', fontSize: '.85em', color: '#475569' }}>
                 {last ? `Last data: ${last}` : 'Last data: unknown'}
               </div>
             </div>
           )
          })}
        </div>
      )}
      {/* DTR (Registry) */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>My Registry Twins (DTR)</h2>
        <div>
          {me?.is_staff && (
            <>
              <label>Scope: </label>
              <button type='button' onClick={() => { setScope('mine'); loadRegistryTwins(); loadServices(); }} disabled={scope==='mine'}>Mine</button>
              <button type='button' onClick={() => { setScope('all'); loadRegistryTwins(); loadServices(); }} disabled={scope==='all'} style={{ marginLeft: '.5rem' }}>All</button>
              <span style={{ marginLeft: '.75rem' }} />
            </>
          )}
          <button onClick={() => { loadRegistryTwins(); loadServices(); }}>Refresh</button>
        </div>
        <ul>
          {registryTwins.map(t => (
            <li key={t.twin_id} style={{ marginTop: '.5rem' }}>
              <strong>{t.twin_id}</strong> {t.metadata?.status ? `(${t.metadata.status})` : ''}
              <div style={{ fontSize: '.9em', color: '#334155' }}>
                <div>API: <code>{t.interfaces?.api || '-'}</code></div>
                <div>Streams: {(t.interfaces?.data_streams||[]).join(', ') || '-'}</div>
                <div>Domain: {(t.metadata?.domain||[]).join(', ') || '-'}</div>
                <div>Last data: {lastData[t.twin_id]?.ts || 'unknown'} {lastData[t.twin_id]?.source ? `· source: ${lastData[t.twin_id].source}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Admin panel (staff only) */}
      {me?.is_staff && (
        <div style={{ border: '2px solid #94a3b8', borderRadius: 8, padding: '1rem', margin: '.5rem 0', background: '#f8fafc' }}>
          <h2>Admin</h2>
          <div style={{ marginBottom: '.5rem' }}>
            <button onClick={scanTwins}>Scan repo for twins</button>
            <span style={{ marginLeft: '.75rem', color: '#2563eb' }}>{status}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h3>Users</h3>
              <div>
                <input placeholder='username/email' value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} />
                <input placeholder='email' value={newUser.email} onChange={e=>setNewUser({...newUser, email: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <input placeholder='password' value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} style={{ marginLeft: '.5rem' }} />
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
                <input placeholder='name' value={newTwin.name} onChange={e=>setNewTwin({...newTwin, name: e.target.value})} />
                <input placeholder='ui_url' value={newTwin.ui_url} onChange={e=>setNewTwin({...newTwin, ui_url: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <input placeholder='dtr_id' value={newTwin.dtr_id} onChange={e=>setNewTwin({...newTwin, dtr_id: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <button onClick={createTwin} style={{ marginLeft: '.5rem' }}>Create</button>
              </div>
              {/* Existing Twin Cards */}
              <div style={{ marginTop: '.75rem' }}>
                <h4 style={{ margin: '.25rem 0' }}>Existing Twin Cards</h4>
                <ul>
                  {(admin.twins || []).map(t => (
                    <li key={t.twin_id} style={{ marginTop: '.35rem' }}>
                      <strong>{t.name}</strong> — UI: <code>{t.ui_url}</code> {t.dtr_id ? `· DTR: ${t.dtr_id}` : ''} · id: <code>{t.twin_id}</code>
                      <button onClick={() => deleteTwin(t.twin_id)} style={{ marginLeft: '.5rem' }}>Delete</button>
                      <button onClick={() => setNewGrant({ ...newGrant, twin_id: t.twin_id })} style={{ marginLeft: '.5rem' }}>Use ID for grant</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: '.5rem' }}>
                <input placeholder='username' value={newGrant.username} onChange={e=>setNewGrant({...newGrant, username: e.target.value})} />
                <input placeholder='twin_id' value={newGrant.twin_id} onChange={e=>setNewGrant({...newGrant, twin_id: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <button onClick={createGrant} style={{ marginLeft: '.5rem' }}>Grant</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h3>Grants</h3>
            <ul>
              {(admin.grants || []).map(g => (
                <li key={`${g.user}::${g.twin_id}`}>
                  {g.user} → {g.twin} <code>({g.twin_id})</code>
                  <button onClick={() => deleteGrant(g.user, g.twin_id)} style={{ marginLeft: '.5rem' }}>Revoke</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* end content */}
    </div>
  )
}

const btnStyle = { display: 'inline-block', marginTop: '.5rem', background: '#2563eb', color: '#fff', padding: '.5rem .75rem', borderRadius: 6, textDecoration: 'none' }
