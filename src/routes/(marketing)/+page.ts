import '../../app.css'
import { redirect } from '@sveltejs/kit'

export const ssr = true
export const prerender = false
export const csr = true

export function load() {
	redirect(307, '/library/tracks')
}
