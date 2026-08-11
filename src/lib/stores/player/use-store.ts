import { createContext } from 'svelte'
import type { PlayerStore } from './player.svelte.js'

export const [usePlayer, setPlayerStoreContext] = createContext<PlayerStore>()
