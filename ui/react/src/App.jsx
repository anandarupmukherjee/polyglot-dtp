import React, { useEffect, useState } from 'react'

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8084'
const tokenKey = 'dtp_token'

export default function App(){
  const [email, setEmail] = useState('demo@example.com')
  const [pw, setPw] = useState('demo12345')
  const [status, setStatus] = useState('')
  const [me, setMe] = useState(null)
  const [admin, setAdmin] = useState({ users: [], twins: [], grants: [] })
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '' })
  const [newTwin, setNewTwin] = useState({ name: '', ui_url: '' })
  const [newGrant, setNewGrant] = useState({ username: '', twin_id: '' })
  const [twins, setTwins] = useState([])

  const login = async () => {
    setStatus('Signing in...')
    const res = await fetch(`${apiBase}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password: pw })
    })
    if(!res.ok){ setStatus('Login failed'); return }
    const data = await res.json()
    localStorage.setItem(tokenKey, data.access)
    setStatus('Signed in')
    await Promise.all([loadMe(), loadTwins()])
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
  const loadMe = async () => {
    const token = localStorage.getItem(tokenKey)
    if(!token){ setMe(null); return }
    const res = await fetch(`${apiBase}/api/me/`, { headers: { Authorization: `Bearer ${token}` } })
    if(!res.ok){ setMe(null); return }
    const info = await res.json()
    setMe(info)
    if(info.is_staff){ await loadAdmin() }
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
    if(res.ok){ setNewTwin({ name: '', ui_url: '' }); await loadAdmin() }
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

  const [showApi, setShowApi] = useState(false)

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', margin: '2rem' }}>
      <h1>DTP Portal</h1>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>Login</h2>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder='email' />
        <input type='password' value={pw} onChange={e => setPw(e.target.value)} placeholder='password' style={{ marginLeft: '.5rem' }} />
        <button onClick={login} style={{ marginLeft: '.5rem' }}>Login</button>
        <span style={{ marginLeft: '.5rem', color: '#2563eb' }}>{status}</span>
      </div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>Your Twins</h2>
        {twins.length === 0 ? <em>No twins</em> : twins.map(t => (
          <div key={t.twin_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
            <strong>{t.name}</strong><br />
            <a href={t.ui_url} target='_blank' rel='noopener' style={{ display: 'inline-block', marginTop: '.5rem', background: '#2563eb', color: '#fff', padding: '.5rem .75rem', borderRadius: 6, textDecoration: 'none' }}>Open UI</a>
          </div>
        ))}
      </div>
      {me?.is_staff && (
        <div style={{ border: '2px solid #94a3b8', borderRadius: 8, padding: '1rem', margin: '.5rem 0', background: '#f8fafc' }}>
          <h2>Admin</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h3>Users</h3>
              <ul>
                {admin.users.map(u => (
                  <li key={u.id}>
                    {u.username} {u.is_staff ? '(admin)' : ''}
                    <button onClick={() => deleteUser(u.username)} style={{ marginLeft: '.5rem' }}>Delete</button>
                  </li>
                ))}
              </ul>
              <div>
                <input placeholder='username' value={newUser.username} onChange={e=>setNewUser({...newUser, username: e.target.value})} />
                <input placeholder='email' value={newUser.email} onChange={e=>setNewUser({...newUser, email: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <input placeholder='password' type='password' value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <button onClick={createUser} style={{ marginLeft: '.5rem' }}>Create</button>
              </div>
            </div>
            <div>
              <h3>Twins</h3>
              <ul>
                {admin.twins.map(t => (
                  <li key={t.twin_id}>
                    {t.name} ({t.twin_id})
                    <button onClick={() => deleteTwin(t.twin_id)} style={{ marginLeft: '.5rem' }}>Delete</button>
                  </li>
                ))}
              </ul>
              <div>
                <input placeholder='name' value={newTwin.name} onChange={e=>setNewTwin({...newTwin, name: e.target.value})} />
                <input placeholder='ui_url' value={newTwin.ui_url} onChange={e=>setNewTwin({...newTwin, ui_url: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <button onClick={createTwin} style={{ marginLeft: '.5rem' }}>Create</button>
              </div>
            </div>
            <div>
              <h3>Grants</h3>
              <ul>
                {admin.grants.map((g, idx) => (
                  <li key={idx}>
                    {g.user || g.username} → {g.twin} ({g.twin_id})
                    <button onClick={() => deleteGrant(g.user || g.username, g.twin_id)} style={{ marginLeft: '.5rem' }}>Remove</button>
                  </li>
                ))}
              </ul>
              <div>
                <input placeholder='username' value={newGrant.username} onChange={e=>setNewGrant({...newGrant, username: e.target.value})} />
                <input placeholder='twin_id' value={newGrant.twin_id} onChange={e=>setNewGrant({...newGrant, twin_id: e.target.value})} style={{ marginLeft: '.5rem' }} />
                <button onClick={createGrant} style={{ marginLeft: '.5rem' }}>Grant</button>
              </div>
            </div>
          </div>
          <div className='card' style={{ marginTop: '1rem' }}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              API Catalog <button onClick={() => setShowApi(!showApi)}>{showApi ? 'Hide' : 'Show'}</button>
            </h3>
            {showApi && (
              <div>
                <p>Base URL: <code>{apiBase}</code></p>
                <ul>
                  <li>POST <code>/api/token/</code> — obtain JWT</li>
                  <li>GET <code>/api/me/</code> — current user</li>
                  <li>GET <code>/api/me/twins/</code> — assigned twins</li>
                  <li>GET/POST/DELETE <code>/api/admin/users</code> — list/create/delete user</li>
                  <li>GET/POST/DELETE <code>/api/admin/twins</code> — list/create/delete twin</li>
                  <li>GET/POST/DELETE <code>/api/admin/grants</code> — list/create/delete grant</li>
                </ul>
                <p>Example curl (list users):</p>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{`curl -H "Authorization: Bearer <token>" ${apiBase}/api/admin/users`}</pre>
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem', margin: '.5rem 0' }}>
        <h2>Service UIs</h2>
        <a className='button' href='http://localhost:7474' target='_blank' rel='noopener' style={btnStyle}>Neo4j</a>{' '}
        <a className='button' href='http://localhost:8086' target='_blank' rel='noopener' style={btnStyle}>InfluxDB</a>{' '}
        <a className='button' href='http://localhost:9101' target='_blank' rel='noopener' style={btnStyle}>MinIO</a>
      </div>
    </div>
  )
}

const btnStyle = { display: 'inline-block', marginTop: '.5rem', background: '#2563eb', color: '#fff', padding: '.5rem .75rem', borderRadius: 6, textDecoration: 'none' }
