import { createContext } from 'svelte'
import type { PlayerStore } from './player.svelte.js.ts'

export const [usePlayer, setPlayerStoreContext] = createContext<PlayerStore>()
