import { detectParser, type Lyric } from '@braccato/parsers'

export function parseSecondaryLine(words: string): { type: 'translation' | 'romanization' | null; cleaned: string } {
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
		if (lastPrimary && Math.abs(lastPrimary.startTimeMs - curr.startTimeMs) <= 150) {
			if (!curr.agent || curr.agent === lastPrimary.agent) {
				lastPrimary.translation = { text: curr.words.trim(), lang: 'secondary' }
				continue
			}
		}

		result.push(curr)
	}
	return result
}

export class LyricsParser {
	static parse(rawLyrics: string, durationMs: number): Lyric[] {
		const parser = detectParser(rawLyrics)
		const parsed = parser.parse(rawLyrics, durationMs)
		return alignSecondaryLines(parsed)
	}
}
