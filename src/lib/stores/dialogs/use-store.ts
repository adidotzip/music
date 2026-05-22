import { createContext } from 'svelte'
import type { DialogsStore } from './store.svelte.js'

export const [useDialogsStore, setDialogsStoreContext] = createContext<DialogsStore>()
