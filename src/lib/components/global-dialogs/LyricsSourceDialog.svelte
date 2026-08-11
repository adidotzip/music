<script lang="ts">
    import Button from '$lib/components/Button.svelte'
    import CommonDialog from '$lib/components/dialog/CommonDialog.svelte'
    import type { DialogOpenAccessor } from '$lib/components/dialog/Dialog.svelte'
    import TextField from '$lib/components/TextField.svelte'
    import { UNKNOWN_ITEM } from '$lib/library/types.ts'
    import { LyricsCache, type LyricsCacheItem } from '$lib/lyrics/LyricsCache.ts'
    import { LyricsParser } from '$lib/lyrics/LyricsParser.ts'
    import * as m from '$lib/paraglide/messages.js'

    interface LyricsSourceDialogProps {
        open: DialogOpenAccessor<{
            trackId: string
            trackName: string
            artistName: string
            durationMs: number
        }>
    }

    let { open }: LyricsSourceDialogProps = $props()

    const data = $derived(open.get())

    let isFetching = $state(false)
    let searchArtist = $state('')
    let searchTitle = $state('')
    let searchResults = $state<any[]>([])
    let selectedResultIndex = $state<number | null>(null)
    let manualLyricsText = $state('')
    let isDraggingOver = $state(false)
    let fileInputEl = $state<HTMLInputElement>()

    let activeTab = $state<'online' | 'manual' | 'file'>('online')

    $effect(() => {
        if (data) {
            searchArtist = data.artistName === UNKNOWN_ITEM ? '' : data.artistName
            searchTitle = data.trackName === UNKNOWN_ITEM ? '' : data.trackName
            searchResults = []
            selectedResultIndex = null
            manualLyricsText = ''

            LyricsCache.get(data.trackId).then((cached) => {
                if (cached?.lyrics) {
                    manualLyricsText = cached.lyrics
                        .map((l) => (l.isInstrumental ? '[empty]' : l.words))
                        .join('\n')
                }
            })
        }
    })

    const handleSearch = async () => {
        if (!searchTitle.trim()) return
        isFetching = true
        searchResults = []
        selectedResultIndex = null

        try {
            const query = encodeURIComponent(`${searchArtist} ${searchTitle}`.trim())
            const res = await fetch(`https://lrclib.net/api/search?q=${query}`)
            if (res.ok) {
                searchResults = await res.json()
            }
        } catch (e) {
            console.error('Failed to fetch lyrics:', e)
        } throwing: {
            isFetching = false
        }
    }

    const saveLyrics = async (lyricsData: LyricsCacheItem) => {
        if (!data) return
        await LyricsCache.set(data.trackId, lyricsData)
        window.dispatchEvent(new CustomEvent('lyrics-reload'))
        open.close()
    }

    const handleSaveOnlineSelected = async () => {
        if (selectedResultIndex === null || !searchResults[selectedResultIndex]) return
        const item = searchResults[selectedResultIndex]
        const duration = data?.durationMs ?? 0

        const rawText = item.syncedLyrics || item.plainLyrics || ''
        const parsed = LyricsParser.parse(rawText, duration)

        await saveLyrics({
            status: 'found',
            source: 'lrclib',
            lyrics: parsed,
            syncType: item.syncedLyrics ? 'line' : 'plain',
        })
    }

    const handleSaveManual = async () => {
        if (!manualLyricsText.trim() || !data) return
        const parsed = LyricsParser.parse(manualLyricsText, data.durationMs)
        const isPlainOnly = !(manualLyricsText.includes('[') || manualLyricsText.includes('<tt'))

        await saveLyrics({
            status: 'found',
            source: 'local',
            lyrics: parsed,
            syncType: isPlainOnly ? 'plain' : 'line',
        })
    }

    const handleFileContent = async (text: string) => {
        if (!data || !text.trim()) return
        const parsed = LyricsParser.parse(text, data.durationMs)
        const isPlainOnly = !(text.includes('[') || text.includes('<tt'))

        await saveLyrics({
            status: 'found',
            source: 'local',
            lyrics: parsed,
            syncType: isPlainOnly ? 'plain' : 'line',
        })
    }

    const handleFileUpload = (e: Event) => {
        const input = e.target as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (evt) => {
            const content = evt.target?.result as string
            if (content) {
                handleFileContent(content)
            }
        }
        reader.readAsText(file)
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        isDraggingOver = false
        const file = e.dataTransfer?.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (evt) => {
            const content = evt.target?.result as string
            if (content) {
                handleFileContent(content)
            }
        }
        reader.readAsText(file)
    }
</script>

<CommonDialog
    {open}
    icon="text"
    title={m.lyricsDialogTitle?.() ?? 'Lyrics Source'}
    class="[--dialog-width:--spacing(160)]"
    buttons={[
        {
            title: m.libraryCancel?.() ?? 'Cancel',
        },
        ...(activeTab === 'online'
            ? [
                  {
                      title: m.librarySave?.() ?? 'Save',
                      type: 'submit' as const,
                      disabled: selectedResultIndex === null,
                  },
              ]
            : []),
        ...(activeTab === 'manual'
            ? [
                  {
                      title: m.librarySave?.() ?? 'Save',
                      type: 'submit' as const,
                      disabled: !manualLyricsText.trim(),
                  },
              ]
            : []),
    ]}
    onsubmit={() => {
        if (activeTab === 'online') handleSaveOnlineSelected()
        if (activeTab === 'manual') handleSaveManual()
    }}
>
    <div class="flex flex-col gap-4 max-h-[70vh] min-h-0 shrink overflow-y-auto pr-1 overscroll-contain text-body-md">
        <!-- Navigation Tabs -->
        <div class="flex border-b border-outlineVariant gap-2">
            <button
                type="button"
                class={[
                    'flex items-center gap-2 border-b-2 px-4 py-2 font-medium text-label-lg transition-colors',
                    activeTab === 'online'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-onSurfaceVariant hover:text-onSurface'
                ]}
                onclick={() => (activeTab = 'online')}
            >
                Online Search
            </button>
            <button
                type="button"
                class={[
                    'flex items-center gap-2 border-b-2 px-4 py-2 font-medium text-label-lg transition-colors',
                    activeTab === 'manual'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-onSurfaceVariant hover:text-onSurface'
                ]}
                onclick={() => (activeTab = 'manual')}
            >
                Manual Input
            </button>
            <button
                type="button"
                class={[
                    'flex items-center gap-2 border-b-2 px-4 py-2 font-medium text-label-lg transition-colors',
                    activeTab === 'file'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-onSurfaceVariant hover:text-onSurface'
                ]}
                onclick={() => (activeTab = 'file')}
            >
                Import File
            </button>
        </div>

        {#if activeTab === 'online'}
            <form
                class="flex flex-col gap-3"
                onsubmit={(e) => {
                    e.preventDefault()
                    handleSearch()
                }}
            >
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <span class="text-label-md text-onSurfaceVariant">Track Title</span>
                        <TextField bind:value={searchTitle} name="title" required />
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-label-md text-onSurfaceVariant">Artist</span>
                        <TextField bind:value={searchArtist} name="artist" />
                    </div>
                </div>
                <div class="flex justify-end">
                    <Button kind="filled" type="submit" disabled={isFetching}>
                        {#if isFetching}
                            Searching...
                        {:else}
                            Search LRCLIB
                        {/if}
                    </Button>
                </div>
            </form>

            <div class="flex flex-col gap-2 mt-2">
                {#if searchResults.length > 0}
                    <span class="text-label-md text-onSurfaceVariant">Search Results</span>
                    <div class="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                        {#each searchResults as result, idx}
                            <button
                                type="button"
                                class={[
                                    'flex items-center justify-between rounded-xl border p-3 text-left transition-all',
                                    selectedResultIndex === idx
                                        ? 'border-primary bg-primaryContainer/30 text-onSurface'
                                        : 'border-outlineVariant bg-surfaceContainerLow hover:bg-surfaceContainer'
                                ]}
                                onclick={() => (selectedResultIndex = idx)}
                            >
                                <div class="flex flex-col gap-0.5 overflow-hidden">
                                    <span class="font-medium truncate">{result.trackName}</span>
                                    <span class="text-body-sm text-onSurfaceVariant truncate">
                                        {result.artistName} — {result.albumName || 'Single'}
                                    </span>
                                </div>
                                <div class="flex items-center gap-2 shrink-0">
                                    {#if result.syncedLyrics}
                                        <span class="rounded bg-primary/10 px-2 py-0.5 text-label-sm text-primary font-semibold">
                                            Synced
                                        </span>
                                    {:else if result.plainLyrics}
                                        <span class="rounded bg-surfaceVariant px-2 py-0.5 text-label-sm text-onSurfaceVariant">
                                            Plain
                                        </span>
                                    {/if}
                                </div>
                            </button>
                        {/each}
                    </div>
                {:else if !isFetching && searchTitle}
                    <div class="flex flex-col items-center justify-center p-8 text-center text-onSurfaceVariant">
                        <span>No lyrics found. Try refining your search query.</span>
                    </div>
                {/if}
            </div>
        {/if}

        {#if activeTab === 'manual'}
            <div class="flex flex-col gap-2">
                <span class="text-label-md text-onSurfaceVariant">
                    Paste raw text or LRC formatted lyrics ([00:12.34] lyric text)
                </span>
                <textarea
                    bind:value={manualLyricsText}
                    rows="10"
                    class="w-full rounded-xl border border-outlineVariant bg-surfaceContainerLow p-3 text-body-md text-onSurface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="[00:00.00] Enter lyrics here..."
                ></textarea>
            </div>
        {/if}

        {#if activeTab === 'file'}
            <div class="flex flex-col gap-4 py-4">
                <input
                    type="file"
                    accept=".lrc,.txt"
                    class="hidden"
                    bind:this={fileInputEl}
                    onchange={handleFileUpload}
                />
                <div
                    class={[
                        'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-outlineVariant p-8 text-center transition-all bg-surfaceContainerLowest hover:bg-surfaceContainerLow/50',
                        isDraggingOver && 'border-primary bg-primary/5'
                    ]}
                    ondragover={(e) => {
                        e.preventDefault()
                        isDraggingOver = true
                    }}
                    ondragleave={() => {
                        isDraggingOver = false
                    }}
                    ondrop={handleDrop}
                >
                    <span class="font-medium text-onSurface">Drag & drop your .lrc or .txt file here</span>
                    <span class="text-body-sm text-onSurfaceVariant mt-1">or browse from your device</span>
                    <Button
                        kind="outlined"
                        class="mt-4"
                        onclick={() => fileInputEl?.click()}
                    >
                        Browse Files
                    </Button>
                </div>
            </div>
        {/if}
    </div>
</CommonDialog>
