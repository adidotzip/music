import { getThemePaletteRgbEntries } from '$lib/theme.ts'
import { argbFromHex, hexFromArgb } from '@material/material-color-utilities'

const CACHE_PREFIX = 'adi_music_dynamic_color:'
const CACHE_VERSION = 'v1'

type ColorCache = Record<'light' | 'dark', string>

const cache = new Map<string, ColorCache>()

const safeStorageGet = (key: string): ColorCache | null => {
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return null
		const value = JSON.parse(raw) as ColorCache
		if (value?.light && value?.dark) return value
	} catch {
		// Ignore storage failures.
	}
	return null
}

const safeStorageSet = (key: string, value: ColorCache): void => {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Ignore storage quota/private-mode failures.
	}
}

const normalizeHex = (value: string): string | null => {
	const hex = value.trim()
	if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
	return hex.toLowerCase()
}

const argbToHex = (argb: number): string => hexFromArgb(argb).toLowerCase()

const getCacheKey = (trackId: number, artworkUrl?: string): string =>
	`${CACHE_PREFIX}${CACHE_VERSION}:${trackId}:${artworkUrl ?? ''}`

const imageToColor = async (url: string): Promise<number | null> => {
	if (typeof window === 'undefined') return null

	const response = await fetch(url, {
		cache: 'force-cache',
		credentials: 'omit',
		referrerPolicy: 'no-referrer',
	})
	if (!response.ok) return null

	const blob = await response.blob()
	const bitmap = await createImageBitmap(blob)

	try {
		const size = 64
		const canvas = document.createElement('canvas')
		canvas.width = size
		canvas.height = size
		const context = canvas.getContext('2d', { willReadFrequently: true })
		if (!context) return null

		context.drawImage(bitmap, 0, 0, size, size)
		const pixels = context.getImageData(0, 0, size, size).data

		let r = 0
		let g = 0
		let b = 0
		let weight = 0

		for (let i = 0; i < pixels.length; i += 4) {
			const alpha = pixels[i + 3] / 255
			if (alpha < 0.5) continue

			const red = pixels[i] / 255
			const green = pixels[i + 1] / 255
			const blue = pixels[i + 2] / 255

			const max = Math.max(red, green, blue)
			const min = Math.min(red, green, blue)
			const saturation = max === 0 ? 0 : (max - min) / max
			const brightness = max

			if (saturation < 0.12 || brightness < 0.08) continue

			const pixelWeight = alpha * (0.35 + saturation * 0.65)
			r += red * pixelWeight
			g += green * pixelWeight
			b += blue * pixelWeight
			weight += pixelWeight
		}

		if (weight === 0) return null

		const red = Math.round((r / weight) * 255)
		const green = Math.round((g / weight) * 255)
		const blue = Math.round((b / weight) * 255)
		return (0xff << 24) | (red << 16) | (green << 8) | blue
	} finally {
		bitmap.close()
	}
}

const getPrimaryColorFromTrack = async (
	track: {
		primaryColor?: number
		image?: { full?: Blob | string; small?: Blob | string }
	},
): Promise<number | null> => {
	if (typeof track.primaryColor === 'number' && track.primaryColor !== 0) {
		return track.primaryColor
	}

	const artwork = track.image?.full ?? track.image?.small
	if (typeof artwork === 'string') {
		return imageToColor(artwork)
	}

	if (artwork instanceof Blob) {
		const objectUrl = URL.createObjectURL(artwork)
		try {
			return imageToColor(objectUrl)
		} finally {
			URL.revokeObjectURL(objectUrl)
		}
	}

	return null
}

export const applyTrackDynamicTheme = async (
	trackId: number,
	track: {
		primaryColor?: number
		image?: { full?: Blob | string; small?: Blob | string }
	},
	isDark: boolean,
): Promise<void> => {
	if (typeof window === 'undefined' || typeof document === 'undefined') return

	const artwork = typeof track.image?.full === 'string' ? track.image.full : typeof track.image?.small === 'string' ? track.image.small : undefined
	const key = getCacheKey(trackId, artwork)

	let colors = cache.get(key) ?? safeStorageGet(key)
	if (!colors) {
		const argb = await getPrimaryColorFromTrack(track)
		if (argb === null) return

		colors = {
			light: argbToHex(argb),
			dark: getThemePaletteRgbEntries(argb, true).find(([token]) => token === 'primary')?.[1] ?? argbToHex(argb),
		}
		cache.set(key, colors)
		safeStorageSet(key, colors)
	}

	const source = normalizeHex(isDark ? colors.dark : colors.light)
	if (!source) return

	const palette = getThemePaletteRgbEntries(argbFromHex(source), isDark)
	document.documentElement.classList.add('theme-transition')
	for (const [token, hex] of palette) {
		document.documentElement.style.setProperty(`--color-${token}`, hex)
	}
	window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 450)
}

export const resetDynamicTheme = (): void => {
	if (typeof document === 'undefined') return

	for (const [token] of getThemePaletteRgbEntries(0xffff0000, false)) {
		document.documentElement.style.removeProperty(`--color-${token}`)
	}
}
