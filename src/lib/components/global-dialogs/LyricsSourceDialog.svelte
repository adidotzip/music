<script lang="ts" module>
    import Button from '$lib/components/Button.svelte'
    import Dialog, { type DialogOpenAccessor } from '$lib/components/dialog/Dialog.svelte'
    import TextField from '$lib/components/TextField.svelte'
    import Icon from '$lib/components/icon/Icon.svelte'
    import Spinner from '$lib/components/Spinner.svelte'
    import Tabs from '$lib/components/Tabs.svelte'
    import type { TrackData } from '$lib/library/get/value.ts'
    import { LyricsCache, type CachedLyricsResult } from '$lib/lyrics/LyricsCache.ts'
    import { LyricsParser } from '$lib/lyrics/LyricsParser.ts'
    import { LyricsProvider } from '$lib/lyrics/LyricsProvider.ts'

    export interface LyricsSourceDialogProps {
        open: DialogOpenAccessor<TrackData>
    }

    interface CustomSource {
        id: string
        name: string
        url: string
    }
</script>

<script lang="ts">
    let { open }: LyricsSourceDialogProps = $props()

    const track = $derived(open.get())

    const tabs = ['sources', 'upload', 'custom-apis'] as const
    let selectedTabIndex = $state(0)
    const currentTab = $derived(tabs[selectedTabIndex])

    let customSources: CustomSource[] = $state([])
    let newSourceName = $state('')
    let newSourceUrl = $state('')
    let fetching = $state(false)
    let activeFetchingSource = $state<string | null>(null)
    let isDraggingOver = $state(false)

    $effect(() => {
        if (typeof window !== 'undefined') {
            const raw = localStorage.getItem('snaeplayer-custom-lyrics-sources')
            if (raw) {
                try {
                    customSources = JSON.parse(raw)
                } catch {}
            }
        }
    })

    function saveCustomSources() {
        localStorage.setItem('snaeplayer-custom-lyrics-sources', JSON.stringify(customSources))
    }

    function addCustomSource() {
        if (!newSourceName.trim() || !newSourceUrl.trim()) {
            snackbar('Please fill out both Name and URL')
            return
        }
        const newSource: CustomSource = {
            id: crypto.randomUUID(),
            name: newSourceName.trim(),
            url: newSourceUrl.trim(),
        }
        customSources = [...customSources, newSource]
        saveCustomSources()
        newSourceName = ''
        newSourceUrl = ''
        snackbar('Custom source added successfully')
    }

    function deleteCustomSource(id: string) {
        customSources = customSources.filter((cs) => cs.id !== id)
        saveCustomSources()
        snackbar('Custom source deleted')
    }

    async function selectSource(sourceId: 'adi' | 'lrcmux' | 'lrclib' | string) {
        if (!track) return
        fetching = true
        activeFetchingSource = sourceId

        try {
            let result: CachedLyricsResult | null = null
            const durationMs = Math.round(track.duration) * 1000

            if (sourceId === 'adi') {
                const resp = await LyricsProvider.fetchFromAdi(track)
                if (resp) {
                    const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
                    result = {
                        status: 'found',
                        source: 'adi',
                        lyrics,
                        syncType: resp.isPlainOnly ? 'plain' : 'karaoke',
                    }
                }
            } else if (sourceId === 'lrcmux') {
                const resp = await LyricsProvider.fetchFromLrcmux(track)
                if (resp) {
                    const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
                    const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
                    result = {
                        status: 'found',
                        source: 'lrcmux',
                        lyrics,
                        syncType: hasWordTiming ? 'karaoke' : 'line',
                    }
                }
            } else if (sourceId === 'lrclib') {
                const resp = await LyricsProvider.fetchFromLrclib(track)
                if (resp) {
                    if (resp.rawLyrics === 'Instrumental') {
                        result = { status: 'instrumental' }
                    } else {
                        const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
                        const hasWordTiming = lyrics.some((lyric) => lyric.parts && lyric.parts.length > 0)
                        result = {
                            status: 'found',
                            source: 'lrclib',
                            lyrics,
                            syncType: hasWordTiming ? 'karaoke' : resp.isPlainOnly ? 'plain' : 'line',
                        }
                    }
                }
            } else {
                const custom = customSources.find((cs) => cs.id === sourceId)
                if (custom) {
                    const resp = await LyricsProvider.fetchFromCustomSource(track, custom)
                    if (resp) {
                        const lyrics = LyricsParser.parse(resp.rawLyrics, durationMs)
                        result = {
                            status: 'found',
                            source: custom.name,
                            lyrics,
                            syncType: resp.isPlainOnly ? 'plain' : 'line',
                        }
                    }
                }
            }

            if (result) {
                await LyricsCache.set(track.id, result)
                window.dispatchEvent(new CustomEvent('lyrics-reload'))
                snackbar('Lyrics loaded successfully')
                open.close()
            } else {
                snackbar('Failed to fetch lyrics from this source')
            }
        } catch (e) {
            console.error(e)
            snackbar('An error occurred while fetching lyrics')
        } finally {
            fetching = false
            activeFetchingSource = null
        }
    }

    async function resetToDefault() {
        if (!track) return
        try {
            const db = await (await import('$lib/db/database.ts')).getDatabase()
            await db.delete('lyrics', track.id)
            window.dispatchEvent(new CustomEvent('lyrics-reload'))
            snackbar('Lyrics reset to default search')
            open.close()
        } catch (e) {
            console.error(e)
            snackbar('Failed to reset lyrics')
        }
    }

    function processLyricsText(text: string) {
        if (!track) return
        try {
            const durationMs = Math.round(track.duration) * 1000
            const lyrics = LyricsParser.parse(text, durationMs)
            const isPlainOnly = !text.includes('[') && !text.includes('<tt')
            const result: CachedLyricsResult = {
                status: 'found',
                source: 'uploaded',
                lyrics,
                syncType: isPlainOnly ? 'plain' : 'line',
            }
            LyricsCache.set(track.id, result).then(() => {
                window.dispatchEvent(new CustomEvent('lyrics-reload'))
                snackbar('Lyrics uploaded successfully')
                open.close()
            })
        } catch (err) {
            console.error(err)
            snackbar('Failed to parse uploaded lyrics file')
        }
    }

    function handleFileUpload(event: Event) {
        const target = event.target as HTMLInputElement
        const file = target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            if (text) processLyricsText(text)
            else snackbar('Failed to read file')
        }
        reader.readAsText(file)
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault()
        isDraggingOver = false
        const file = event.dataTransfer?.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            if (text) processLyricsText(text)
            else snackbar('Failed to read file')
        }
        reader.readAsText(file)
    }
</script>

<Dialog {open} class="[--dialog-width:--spacing(140)]">
    {#snippet header()}
        <header data-dialog-header class="flex items-center justify-between px-6 pt-6 pb-2">
            <div class="flex items-center gap-3">
                <div class="flex size-10 items-center justify-center rounded-full bg-primaryContainer text-onPrimaryContainer">
                    <Icon type="musicNote" class="size-5" />
                </div>
                <div>
                    <h2 class="text-title-large font-bold text-onSurface">Lyrics Settings</h2>
                    <p class="text-body-small text-onSurfaceVariant">Select provider or upload synchronized lyrics</p>
                </div>
            </div>
        </header>
    {/snippet}

    {#snippet children({ close })}
        {#if track}
            <div data-dialog-content class="flex flex-col overflow-hidden">
                <!-- Track Context Card -->
                <div class="mx-6 my-3 flex items-center justify-between gap-4 rounded-2xl bg-surfaceContainerLow p-3 px-4 border border-outlineVariant/40">
                    <div class="flex flex-col min-w-0">
                        <span class="text-title-small font-bold text-onSurface truncate">{track.name}</span>
                        <span class="text-body-small text-onSurfaceVariant truncate">
                            {Array.isArray(track.artists) ? track.artists.join(', ') : track.artists}
                        </span>
                    </div>
                    <Button kind="outlined" size="small" disabled={fetching} onclick={resetToDefault}>
                        Reset Default
                    </Button>
                </div>

                <!-- Navigation Tabs -->
                <div class="px-6 border-b border-outlineVariant/30">
                    <Tabs
                        selectedIndex={selectedTabIndex}
                        items={tabs}
                        onchange={(_, idx) => {
                            selectedTabIndex = idx
                        }}
                        class="w-full"
                    >
                        {#snippet text(tab)}
                            <span class="text-label-medium capitalize">
                                {tab === 'custom-apis' ? 'Custom APIs' : tab}
                            </span>
                        {/snippet}
                    </Tabs>
                </div>

                <!-- Tab Body Window -->
                <div class="grow overflow-y-auto px-6 py-4 max-h-[60vh] min-h-[280px]">
                    {#if currentTab === 'sources'}
                        <div class="flex flex-col gap-2.5">
                            <span class="text-label-medium font-semibold text-onSurfaceVariant px-1 mb-1">
                                Built-in Providers
                            </span>

                            <!-- Provider Buttons -->
                            <button
                                type="button"
                                disabled={fetching}
                                class="group flex items-center justify-between rounded-2xl bg-surfaceContainerLow p-3.5 px-4 text-left transition-all hover:bg-surfaceContainer hover:shadow-xs active:scale-[0.99] disabled:opacity-50"
                                onclick={() => selectSource('adi')}
                            >
                                <div class="flex items-center gap-3">
                                    <div class="flex size-9 items-center justify-center rounded-xl bg-surfaceContainerHigh group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                        <Icon type="musicNote" class="size-4" />
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="text-body-medium font-semibold text-onSurface">Adi Lyrics</span>
                                        <span class="text-body-small text-onSurfaceVariant">Primary Provider</span>
                                    </div>
                                </div>
                                {#if fetching && activeFetchingSource === 'adi'}
                                    <Spinner class="size-5 text-primary" />
                                {:else}
                                    <Icon type="chevronRight" class="text-onSurfaceVariant/60 size-5 transition-transform group-hover:translate-x-0.5" />
                                {/if}
                            </button>

                            <button
                                type="button"
                                disabled={fetching}
                                class="group flex items-center justify-between rounded-2xl bg-surfaceContainerLow p-3.5 px-4 text-left transition-all hover:bg-surfaceContainer hover:shadow-xs active:scale-[0.99] disabled:opacity-50"
                                onclick={() => selectSource('lrcmux')}
                            >
                                <div class="flex items-center gap-3">
                                    <div class="flex size-9 items-center justify-center rounded-xl bg-surfaceContainerHigh group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                        <Icon type="musicNote" class="size-4" />
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="text-body-medium font-semibold text-onSurface">LRC Mux</span>
                                        <span class="text-body-small text-onSurfaceVariant">Secondary Provider</span>
                                    </div>
                                </div>
                                {#if fetching && activeFetchingSource === 'lrcmux'}
                                    <Spinner class="size-5 text-primary" />
                                {:else}
                                    <Icon type="chevronRight" class="text-onSurfaceVariant/60 size-5 transition-transform group-hover:translate-x-0.5" />
                                {/if}
                            </button>

                            <button
                                type="button"
                                disabled={fetching}
                                class="group flex items-center justify-between rounded-2xl bg-surfaceContainerLow p-3.5 px-4 text-left transition-all hover:bg-surfaceContainer hover:shadow-xs active:scale-[0.99] disabled:opacity-50"
                                onclick={() => selectSource('lrclib')}
                            >
                                <div class="flex items-center gap-3">
                                    <div class="flex size-9 items-center justify-center rounded-xl bg-surfaceContainerHigh group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                        <Icon type="musicNote" class="size-4" />
                                    </div>
                                    <div class="flex flex-col">
                                        <span class="text-body-medium font-semibold text-onSurface">LRCLIB</span>
                                        <span class="text-body-small text-onSurfaceVariant">Tertiary Provider</span>
                                    </div>
                                </div>
                                {#if fetching && activeFetchingSource === 'lrclib'}
                                    <Spinner class="size-5 text-primary" />
                                {:else}
                                    <Icon type="chevronRight" class="text-onSurfaceVariant/60 size-5 transition-transform group-hover:translate-x-0.5" />
                                {/if}
                            </button>

                            <!-- Custom Sources Section -->
                            {#if customSources.length > 0}
                                <span class="text-label-medium font-semibold text-onSurfaceVariant px-1 mt-4 mb-1">
                                    Saved Custom APIs
                                </span>
                                {#each customSources as source}
                                    <button
                                        type="button"
                                        disabled={fetching}
                                        class="group flex items-center justify-between rounded-2xl bg-surfaceContainerLow p-3.5 px-4 text-left transition-all hover:bg-surfaceContainer hover:shadow-xs active:scale-[0.99] disabled:opacity-50"
                                        onclick={() => selectSource(source.id)}
                                    >
                                        <div class="flex flex-col min-w-0 pr-2">
                                            <span class="text-body-medium font-semibold text-onSurface truncate">{source.name}</span>
                                            <span class="text-body-small text-onSurfaceVariant truncate font-mono">
                                                {source.url}
                                            </span>
                                        </div>
                                        {#if fetching && activeFetchingSource === source.id}
                                            <Spinner class="size-5 text-primary" />
                                        {:else}
                                            <Icon type="chevronRight" class="text-onSurfaceVariant/60 size-5 transition-transform group-hover:translate-x-0.5" />
                                        {/if}
                                    </button>
                                {/each}
                            {/if}
                        </div>
                    {:else if currentTab === 'upload'}
                        <!-- Dropzone area -->
                        <div
                            class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-outlineVariant p-8 text-center transition-all bg-surfaceContainerLowest hover:bg-surfaceContainerLow/50"
                            class:border-primary={isDraggingOver}
                            class:bg-primary/5={isDraggingOver}
                            ondragover={(e) => { e.preventDefault(); isDraggingOver = true }}
                            ondragleave={() => { isDraggingOver = false }}
                            ondrop={handleDrop}
                            role="region"
                            aria-label="File upload drop area"
                        >
                            <div class="flex size-14 items-center justify-center rounded-2xl bg-primaryContainer text-onPrimaryContainer mb-3">
                                <Icon type="folder" class="size-7" />
                            </div>
                            <div class="text-title-medium font-bold text-onSurface mb-1">Upload Lyrics File</div>
                            <p class="text-body-small text-onSurfaceVariant max-w-64 mb-5">
                                Drag and drop an <code class="text-primary font-mono">.lrc</code>, <code class="text-primary font-mono">.ttml</code>, or <code class="text-primary font-mono">.txt</code> file here.
                            </p>

                            <label class="interactable flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 text-label-large font-semibold text-onPrimary shadow-xs transition-all hover:bg-opacity-90 active:scale-95">
                                <Icon type="plus" class="size-4" />
                                Browse Files
                                <input
                                    type="file"
                                    accept=".lrc,.ttml,.txt"
                                    class="hidden"
                                    onchange={handleFileUpload}
                                />
                            </label>
                        </div>
                    {:else if currentTab === 'custom-apis'}
                        <div class="flex flex-col gap-5">
                            <div class="flex flex-col gap-3 rounded-2xl bg-surfaceContainerLow p-4 border border-outlineVariant/30">
                                <span class="text-title-small font-bold text-onSurface">Add New Endpoint</span>

                                <TextField
                                    name="sourceName"
                                    placeholder="Source Name (e.g. Personal Server)"
                                    bind:value={newSourceName}
                                    required
                                />

                                <TextField
                                    name="sourceUrl"
                                    placeholder="API URL Template"
                                    bind:value={newSourceUrl}
                                    required
                                />

                                <div class="rounded-xl bg-surfaceContainerHigh/60 p-3 text-body-small text-onSurfaceVariant leading-relaxed">
                                    <span class="font-semibold block mb-1">URL Placeholders:</span>
                                    <div class="flex flex-wrap gap-1.5 font-mono text-primary">
                                        <span class="bg-surfaceContainer px-1.5 py-0.5 rounded border border-outlineVariant/40">{`{title}`}</span>
                                        <span class="bg-surfaceContainer px-1.5 py-0.5 rounded border border-outlineVariant/40">{`{artist}`}</span>
                                        <span class="bg-surfaceContainer px-1.5 py-0.5 rounded border border-outlineVariant/40">{`{album}`}</span>
                                        <span class="bg-surfaceContainer px-1.5 py-0.5 rounded border border-outlineVariant/40">{`{duration}`}</span>
                                    </div>
                                </div>

                                <Button kind="filled" class="mt-1" onclick={addCustomSource}>
                                    Save Endpoint
                                </Button>
                            </div>

                            {#if customSources.length > 0}
                                <div class="flex flex-col gap-2">
                                    <span class="text-label-medium font-semibold text-onSurfaceVariant px-1">
                                        Existing Endpoints ({customSources.length})
                                    </span>
                                    {#each customSources as source}
                                        <div class="flex items-center justify-between rounded-xl bg-surfaceContainerLow p-3 px-4 border border-outlineVariant/30">
                                            <div class="flex flex-col min-w-0 pr-3">
                                                <span class="text-body-medium font-bold text-onSurface truncate">{source.name}</span>
                                                <span class="text-body-small text-onSurfaceVariant truncate font-mono">{source.url}</span>
                                            </div>
                                            <button
                                                type="button"
                                                class="interactable flex size-9 shrink-0 items-center justify-center rounded-full text-error hover:bg-error/10 transition-colors"
                                                onclick={() => deleteCustomSource(source.id)}
                                            >
                                                <Icon type="trashOutline" class="size-4" />
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- Footer -->
                <div data-dialog-footer class="flex items-center justify-end px-6 py-3.5 bg-surfaceContainerLow border-t border-outlineVariant/30">
                    <Button kind="flat" onclick={close}>Close</Button>
                </div>
            </div>
        {/if}
    {/snippet}
</Dialog>
