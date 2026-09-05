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
            result.push({ ...curr })
            continue
        }

        // Fast reverse lookup without array cloning O(1) tail check
        let lastPrimaryIdx = -1
        for (let i = result.length - 1; i >= 0; i--) {
            if (!result[i].isInstrumental) {
                lastPrimaryIdx = i
                break
            }
        }

        const lastPrimary = lastPrimaryIdx !== -1 ? result[lastPrimaryIdx] : null
        const isTimeMatch = lastPrimary && Math.abs(lastPrimary.startTimeMs - curr.startTimeMs) <= 150

        const sec = parseSecondaryLine(curr.words)
        
        if (sec.type && isTimeMatch && lastPrimary) {
            if (sec.type === 'translation') {
                lastPrimary.translation = { text: sec.cleaned, lang: 'secondary' }
            } else {
                lastPrimary.romanization = sec.cleaned
            }
            continue
        }

        // Fallback alignment for implicit secondary lines (e.g. duplicate timestamped lines)
        if (!sec.type && isTimeMatch && lastPrimary) {
            if (!curr.agent || curr.agent === lastPrimary.agent) {
                if (!lastPrimary.translation) {
                    lastPrimary.translation = { text: curr.words.trim(), lang: 'secondary' }
                    continue
                } else if (!lastPrimary.romanization) {
                    lastPrimary.romanization = curr.words.trim()
                    continue
                }
            }
        }

        result.push({ ...curr })
    }

    return result
}

export class LyricsParser {
    static parse(rawLyrics: string, durationMs: number): Lyric[] {
        let processedLyrics = rawLyrics
        const translationMap = new Map<string, { text: string; lang: string }>()
        const indexedTranslations: Array<{ text: string; lang: string }> = []

        const isTTML = rawLyrics.trim().startsWith('<tt') || rawLyrics.includes('xmlns="http://www.w3.org/ns/ttml"')

        if (isTTML && typeof DOMParser !== 'undefined') {
            try {
                const parser = new DOMParser()
                const doc = parser.parseFromString(rawLyrics, 'text/xml')
                const ps = doc.querySelectorAll('p')

                ps.forEach((p, index) => {
                    const key = p.getAttribute('itunes:key') || p.getAttribute('id') || p.getAttribute('xml:id')
                    const spans = Array.from(p.querySelectorAll('span'))

                    for (const span of spans) {
                        const role = span.getAttribute('ttm:role') || span.getAttribute('role')
                        const lang = span.getAttribute('xml:lang') || span.getAttribute('lang') || 'zh-CN'

                        if (role === 'x-translation') {
                            const translationText = span.textContent?.trim() || ''
                            if (translationText) {
                                const entry = { text: translationText, lang }
                                if (key) translationMap.set(key, entry)
                                indexedTranslations[index] = entry
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

        // Apply translations using Key first, falling back to line index sequence
        if (translationMap.size > 0 || indexedTranslations.length > 0) {
            let nonInstrumentalIndex = 0
            for (const line of aligned) {
                if (line.isInstrumental) continue

                if (line.key && translationMap.has(line.key)) {
                    line.translation = translationMap.get(line.key)!
                } else if (indexedTranslations[nonInstrumentalIndex]) {
                    line.translation = indexedTranslations[nonInstrumentalIndex]
                }
                
                nonInstrumentalIndex++
            }
        }

        return aligned
    }
}
