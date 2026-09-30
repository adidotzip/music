import '../app.css'
import { browser } from '$app/environment'
import { registerServiceWorker } from '$lib/helpers/register-sw'
import { baseLocale, isLocale, overwriteGetLocale, overwriteSetLocale } from '$paraglide/runtime'
import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit'

export const ssr = false
export const prerender = false

const initLocale = () => {
	const savedLocale = localStorage.getItem('snae-locale')
	const locale = isLocale(savedLocale) ? savedLocale : baseLocale

	document.documentElement.lang = locale

	return locale
}

if (browser) {
	const locale = initLocale()
	overwriteGetLocale(() => locale)
	overwriteSetLocale((newLocale) => {
		localStorage.setItem('snae-locale', newLocale)
		window.location.reload()
	})

	registerServiceWorker({
		onNeedRefresh(update) {
			// Apply new deployments automatically. The service worker waits until
			// the new assets are installed, then controllerchange reloads the app.
			update()
		},
	})

	injectSpeedInsights()
}
