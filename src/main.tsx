import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root.tsx'
import { registerSW } from 'virtual:pwa-register'
import { useStore } from './state/store'

// Installed app (PWA): works offline; a new version waits until the player chooses to reload.
const update = registerSW({
  onNeedRefresh: () => useStore.setState({ updateReady: () => update(true) }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
