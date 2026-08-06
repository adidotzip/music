import { getAppIcon } from '../icon.server.js.ts'

export const prerender = true

export const GET = () => {
	const icon = getAppIcon(true)

	return new Response(icon, {
		headers: {
			'Content-Type': 'image/svg+xml',
		},
	})
}
