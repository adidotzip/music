import { createContext } from 'svelte'
import type { MainStore } from './store.svelte.js.ts'

export const [useMainStore, setMainStoreContext] = createContext<MainStore>()
