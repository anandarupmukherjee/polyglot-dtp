import React, { useEffect, useState } from 'react'

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8084'
const tokenKey = 'dtp_token'

export default function App(){
  const [email, setEmail] = useState('demo@example.com')
  const [pw, setPw] = useState('demo12345')
  const [status, setStatus] = useState('')
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
    await loadTwins()
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

