import type { TrackData } from '$lib/library/get/value-queries.ts'
import { LyricsProvider } from './LyricsProvider.ts'
import { LyricsParser } from './LyricsParser.ts'
import { LyricsCache, type CachedLyricsResult } from './LyricsCache.ts'

export type ServiceLyricsResult = CachedLyricsResult

export function getSourceDisplayName(source?: string): string {
    if (!source) return 'Unknown'
    const s = source.toLowerCase()
    if (s === 'adi') return 'Adi Lyrics'
    if (s === 'am-lyrics' || s === 'am' || s === 'binimum' || s === 'bini') return 'AM Lyrics'
    if (s === 'lrcmux') return 'LRC Mux'
    if (s === 'lrclib') return 'LRCLIB'
    if (s === 'plain') return 'Lyrics+'
    if (s === 'lyrics-plus' || s === 'lyricsplus') return 'Lyrics+'
    if (s === 'musixmatch') return 'Musixmatch'
    if (s === 'apple' || s === 'apple-music') return 'Apple Music'
    if (s === 'unison') return 'Unison'
    return source.charAt(0).toUpperCase() + source.slice(1)
}

export class LyricsService {
    static async fetchLyrics(track: TrackData, signal?: AbortSignal): Promise<ServiceLyricsResult> {
        const cached = await LyricsCache.get(track.id)
        if (cached) {
            return cached
        }

        try {
            const durationMs = Math.round(track.duration) * 1000
            let plainLyrics: { content: string; source: string } | null = null

            // A. Query Adi Lyrics (Primary)
            try {
                const adiResponse = await LyricsProvider.fetchFromAdi(track, signal)
                if (adiResponse) {
                    if (!adiResponse.isPlainOnly) {
                        const ttml = LyricsParser.toTTML(adiResponse.rawLyrics, durationMs)
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'adi',
                            ttml,
                            syncType: 'karaoke'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else {
                        plainLyrics = { content: adiResponse.rawLyrics, source: 'adi' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // B. Query AM Lyrics / LyricsPlus (Secondary)
            try {
                const amResponse = await LyricsProvider.fetchFromAmLyrics(track, signal)
                if (amResponse) {
                    if (!amResponse.isPlainOnly) {
                        const ttml = LyricsParser.toTTML(amResponse.rawLyrics, durationMs)
                        const hasWordTiming = ttml.includes('<span')
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: amResponse.source || 'am-lyrics',
                            ttml,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: amResponse.rawLyrics, source: amResponse.source || 'am-lyrics' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // C. Query Unison (Tertiary)
            try {
                const unisonResponse = await LyricsProvider.fetchFromUnison(track, signal)
                if (unisonResponse) {
                    if (!unisonResponse.isPlainOnly) {
                        const ttml = LyricsParser.toTTML(unisonResponse.rawLyrics, durationMs)
                        const hasWordTiming = ttml.includes('<span')
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'unison',
                            ttml,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: unisonResponse.rawLyrics, source: 'unison' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // D. Query LRCLib (Quaternary / Last Fallback)
            try {
                const lrclibResponse = await LyricsProvider.fetchFromLrclib(track, signal)
                if (lrclibResponse) {
                    if (lrclibResponse.rawLyrics === 'Instrumental') {
                        const result: ServiceLyricsResult = { status: 'instrumental' }
                        await LyricsCache.set(track.id, result)
                        return result
                    }

                    if (!lrclibResponse.isPlainOnly) {
                        const ttml = LyricsParser.toTTML(lrclibResponse.rawLyrics, durationMs)
                        const hasWordTiming = ttml.includes('<span')
                        const result: ServiceLyricsResult = {
                            status: 'found',
                            source: 'lrclib',
                            ttml,
                            syncType: hasWordTiming ? 'karaoke' : 'line'
                        }
                        await LyricsCache.set(track.id, result)
                        return result
                    } else if (!plainLyrics) {
                        plainLyrics = { content: lrclibResponse.rawLyrics, source: 'lrclib' }
                    }
                }
            } catch (e) {
                if (e instanceof Error && e.name === 'AbortError') throw e
            }

            // E. Fall back to Plain lyrics if found from any provider
            if (plainLyrics) {
                const ttml = LyricsParser.toTTML(plainLyrics.content, durationMs)
                const result: ServiceLyricsResult = {
                    status: 'found',
                    source: plainLyrics.source,
                    ttml,
                    syncType: 'plain'
                }
                await LyricsCache.set(track.id, result)
                return result
            }

            const notFoundResult: ServiceLyricsResult = { status: 'not-found' }
            await LyricsCache.set(track.id, notFoundResult)
            return notFoundResult

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error
            return { status: 'error' }
        }
    }
}
