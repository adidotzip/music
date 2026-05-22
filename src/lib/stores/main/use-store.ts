import { createContext } from 'svelte'
import type { MainStore } from './store.svelte.js'

export const [useMainStore, setMainStoreContext] = createContext<MainStore>()
