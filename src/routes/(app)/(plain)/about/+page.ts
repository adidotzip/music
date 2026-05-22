import type { PageLoad } from './$types.js'

export const load: PageLoad = (): { title: string } => ({
	title: m.about(),
})
