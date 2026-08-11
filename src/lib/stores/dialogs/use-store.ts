import { createContext } from 'svelte'
import type { DialogsStore } from './store.svelte.js.ts'

export const [useDialogsStore, setDialogsStoreContext] = createContext<DialogsStore>()
