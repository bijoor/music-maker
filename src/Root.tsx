import { lazy, Suspense, useEffect, useState } from 'react'
import App from './app/App.tsx'

// Loaded on demand so its styles never apply to the app.
const Lab = lazy(() => import('./lab/Lab.tsx'))

/** #lab opens the Phase 0 test page; everything else is the app. */
export default function Root() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash === '#lab' ? <Suspense fallback={null}><Lab /></Suspense> : <App />
}
