import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type PlasmodiumLocalState = {
  displayName: string
  avatarHue: number
  setDisplayName: (displayName: string) => void
  randomizeAvatarHue: () => void
}

export const usePlasmodiumStore = create<PlasmodiumLocalState>()(
  persist(
    (set) => ({
      displayName: '',
      avatarHue: Math.floor(Math.random() * 360),
      setDisplayName: (displayName) => set({ displayName }),
      randomizeAvatarHue: () => set({ avatarHue: Math.floor(Math.random() * 360) })
    }),
    {
      name: 'plasmodium-local-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
