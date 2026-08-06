import { detectParser, type Lyric } from '@braccato/parsers'

export class LyricsParser {
	static parse(rawLyrics: string, durationMs: number): Lyric[] {
		const parser = detectParser(rawLyrics)
		return parser.parse(rawLyrics, durationMs)
	}
}
