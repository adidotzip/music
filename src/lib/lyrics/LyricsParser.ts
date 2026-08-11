import { detectParser, type Lyric } from '@braccato/parsers'

export function parseSecondaryLine(words: string): {
	type: 'translation' | 'romanization' | null
	cleaned: string
} {
	const text = words.trim()
	if (text.startsWith('#')) {
		return { type: 'translation', cleaned: text.replace(/^#\s*/, '') }
	}
	if (text.startsWith('&')) {
		return { type: 'romanization', cleaned: text.replace(/^&\s*/, '') }
	}
	const tMatch = text.match(/^\[t(?::[^\]]*)?\]\s*(.*)$/i)
	if (tMatch) {
		return { type: 'translation', cleaned: tMatch[1] ?? '' }
	}
	return { type: null, cleaned: words }
}

export function alignSecondaryLines(lyrics: Lyric[]): Lyric[] {
	const result: Lyric[] = []
	for (const curr of lyrics) {
		if (curr.isInstrumental) {
			result.push(curr)
			continue
		}

		const sec = parseSecondaryLine(curr.words)
		if (sec.type) {
			const lastPrimary = [...result].reverse().find((l) => !l.isInstrumental)
			if (lastPrimary && Math.abs(lastPrimary.startTimeMs - curr.startTimeMs) <= 150) {
				if (sec.type === 'translation') {
					lastPrimary.translation = { text: sec.cleaned, lang: 'secondary' }
				} else {
					lastPrimary.romanization = sec.cleaned
				}
				continue
			}
		}

		const lastPrimary = [...result].reverse().find((l) => !l.isInstrumental)
		if (
			lastPrimary &&
			Math.abs(lastPrimary.startTimeMs - curr.startTimeMs) <= 150 &&
			(!curr.agent || curr.agent === lastPrimary.agent)
		) {
			lastPrimary.translation = { text: curr.words.trim(), lang: 'secondary' }
			continue
		}

		result.push(curr)
	}
	return result
}

export class LyricsParser {
	static parse(rawLyrics: string, durationMs: number): Lyric[] {
		let processedLyrics = rawLyrics
		const translationMap = new Map<string, { text: string; lang: string }>()

		const isTTML =
			rawLyrics.trim().startsWith('<tt') ||
			rawLyrics.includes('xmlns="http://www.w3.org/ns/ttml"')

		if (isTTML && typeof DOMParser !== 'undefined') {
			try {
				const parser = new DOMParser()
				const doc = parser.parseFromString(rawLyrics, 'text/xml')
				const ps = doc.querySelectorAll('p')

				ps.forEach((p, index) => {
					const itunesKey =
						p.getAttribute('itunes:key') ||
						p.getAttribute('id') ||
						p.getAttribute('xml:id')
					const key = itunesKey || String(index)

					const spans = Array.from(p.querySelectorAll('span'))
					for (const span of spans) {
						const role = span.getAttribute('ttm:role') || span.getAttribute('role')
						const lang = span.getAttribute('xml:lang') || span.getAttribute('lang')
						if (role === 'x-translation') {
							const translationText = span.textContent?.trim() || ''
							if (translationText) {
								translationMap.set(key, {
									text: translationText,
									lang: lang || 'zh-CN',
								})
							}
							span.parentNode?.removeChild(span)
						}
					}
				})

				const serializer = new XMLSerializer()
				processedLyrics = serializer.serializeToString(doc)
			} catch (e) {
				console.error('Error pre-processing TTML translations:', e)
			}
		}

		const parser = detectParser(processedLyrics)
		const parsed = parser.parse(processedLyrics, durationMs)
		const aligned = alignSecondaryLines(parsed)

		if (translationMap.size > 0) {
			for (const line of aligned) {
				if (line.isInstrumental) {
					continue
				}
				if (line.key && translationMap.has(line.key)) {
					const trans = translationMap.get(line.key)!
					line.translation = { text: trans.text, lang: trans.lang }
				}
			}
		}

		return aligned
	}
}
