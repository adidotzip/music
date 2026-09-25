<script lang="ts">
    import { page } from '$app/state'
    import Artwork from '$lib/components/Artwork.svelte'
    import Button from '$lib/components/Button.svelte'
    import Header from '$lib/components/Header.svelte'
    import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
    import { generateStableId } from '$lib/services/jiosaavn.ts'
    import { registerRemoteTrack } from '$lib/library/get/value.ts'
    import { normalizeTracks, spicyamll } from '$lib/services/spicyamll.ts'
    import { onMount } from 'svelte'

    const player = usePlayer()

    let loading = $state(true)
    let error = $state<string | null>(null)
    let albumId = $state('')
    let albumName = $state('')
    let artistName = $state('')
    let artwork = $state<string | undefined>()
    let songIds = $state<number[]>([])

    const artworkUrl = (url: unknown, size = 1200) =>
        typeof url === 'string'
            ? url.replace(/\{w\}/g, String(size)).replace(/\{h\}/g, String(size)).replace(/\{f\}/g, 'jpg').replace(/\{c\}/g, 'bb')
            : undefined

    const load = async () => {
        loading = true
        error = null
        try {
            const response = await spicyamll.album({ id: albumId, l: 'en-US' })
            const tracks = await spicyamll.albumTracks(albumId)
            const normalized = normalizeTracks(tracks)

            const root = response && typeof response === 'object' ? response as Record<string, unknown> : {}
            const data = Array.isArray(root.data) ? root.data[0] : root.data
            const resource = data && typeof data === 'object' ? data as Record<string, unknown> : root
            const attrs = resource.attributes && typeof resource.attributes === 'object'
                ? resource.attributes as Record<string, unknown>
                : resource
            const art = attrs.artwork && typeof attrs.artwork === 'object'
                ? attrs.artwork as Record<string, unknown>
                : {}

            albumName = String(attrs.name || page.url.searchParams.get('name') || 'Album')
            artistName = String(attrs.artistName || page.url.searchParams.get('artist') || '')
            artwork = artworkUrl(art.url) || page.url.searchParams.get('art') || undefined

            songIds = normalized.map((song) => {
                const id = generateStableId(`spicyamll:${song.id}`)
                registerRemoteTrack({
                    id,
                    remoteId: Number(song.id) || 0,
                    streaming: true,
                    uuid: `spicyamll:${song.id}`,
                    name: song.name,
                    album: song.album || albumName,
                    artists: song.artist ? [song.artist] : artistName ? [artistName] : [],
                    year: 'Unknown',
                    duration: song.duration || 0,
                    genre: [],
                    trackNo: 0,
                    trackOf: 0,
                    discNo: 0,
                    discOf: 0,
                    language: undefined,
                    image: song.image ? { optimized: false, small: song.image, full: song.image } : undefined,
                    primaryColor: undefined,
                    file: undefined,
                    directory: undefined,
                    fileName: undefined,
                    scannedAt: Date.now(),
                    url: spicyamll.streamUrl(song.id, { codec: 'aac', fallback: true, language: 'en-US' }),
                    favorite: false,
                    type: 'track',
                })
                return id
            })
        } catch (e) {
            error = e instanceof Error ? e.message : 'Unable to load album.'
        } finally {
            loading = false
        }
    }

    const playShuffle = () => {
        if (!songIds.length) return
        const randomIndex = Math.floor(Math.random() * songIds.length)
        player.playTrack(randomIndex, songIds)
    }

    onMount(() => {
        albumId = decodeURIComponent(page.params.id)
        void load()
    })
</script>

<Header title={albumName || 'Album'} />

<main class="relative min-h-screen w-full pb-32 text-onSurface">
    {#if artwork}
        <!-- Apple Music Full-Screen Ambient Glow Background -->
        <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <img 
                src={artwork} 
                alt="" 
                class="h-[80vh] w-full object-cover blur-3xl opacity-35 scale-125 saturate-150 transition-opacity duration-700" 
            />
            <div class="absolute inset-0 bg-gradient-to-b from-surface/20 via-surface/80 to-surface"></div>
        </div>
    {/if}

    <div class="mx-auto flex w-full max-w-(--app-max-content-width) flex-col px-4 sm:pl-20">
        {#if loading}
            <div class="my-auto flex min-h-[60vh] items-center justify-center">
                <div class="text-title-medium text-onSurfaceVariant opacity-70">Loading album...</div>
            </div>
        {:else if error}
            <div class="my-auto flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
                <div class="text-title-lg text-error">{error}</div>
                <Button onclick={() => void load()}>Retry</Button>
            </div>
        {:else}
            <!-- Hero Header Section -->
            <section class="flex flex-col items-center pt-6 text-center">
                <!-- Floating Back / Action Controls Bar -->
                <div class="flex w-full items-center justify-between px-2 pb-4">
                    <button class="flex size-10 items-center justify-center rounded-full bg-surfaceContainerLow/60 backdrop-blur-md text-onSurface hover:bg-surfaceContainerHigh transition-colors" onclick={() => window.history.back()}>
                        <span class="material-symbols-rounded text-2xl">arrow_back</span>
                    </button>
                    <div class="flex items-center gap-2">
                        <button class="flex size-10 items-center justify-center rounded-full bg-surfaceContainerLow/60 backdrop-blur-md text-onSurface hover:bg-surfaceContainerHigh transition-colors">
                            <span class="material-symbols-rounded text-xl">share</span>
                        </button>
                        <button class="flex size-10 items-center justify-center rounded-full bg-surfaceContainerLow/60 backdrop-blur-md text-onSurface hover:bg-surfaceContainerHigh transition-colors">
                            <span class="material-symbols-rounded text-xl">more_horiz</span>
                        </button>
                    </div>
                </div>

                <!-- Apple-style Hero Animated Center Artwork -->
                <div class="relative mt-2 group">
                    <div class="absolute inset-0 rounded-3xl bg-black/20 blur-xl transition-all duration-300 group-hover:blur-2xl"></div>
                    <Artwork 
                        src={artwork} 
                        fallbackIcon="album" 
                        class="relative size-60 sm:size-72 shrink-0 rounded-3xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]" 
                    />
                </div>

                <!-- Typography Stack -->
                <div class="mt-6 flex flex-col items-center max-w-md px-4">
                    <h1 class="text-headline-large sm:text-display-small font-bold tracking-tight text-onSurface">
                        {albumName}
                    </h1>
                    
                    {#if artistName}
                        <div class="mt-1 text-title-medium font-semibold text-primary">
                            {artistName}
                        </div>
                    {/if}

                    <div class="mt-1 text-body-medium text-onSurfaceVariant/80 font-medium">
                        {songIds.length} {songIds.length === 1 ? 'song' : 'songs'}
                    </div>
                </div>

                <!-- Apple Music Floating Glass Action Buttons -->
                <div class="mt-6 flex items-center justify-center gap-3 w-full max-w-xs px-2">
                    <button 
                        class="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-surfaceContainerHighest/40 backdrop-blur-xl border border-outlineVariant/20 text-onSurface font-semibold text-label-large hover:bg-surfaceContainerHighest/70 active:scale-95 transition-all shadow-sm"
                        disabled={!songIds.length}
                        onclick={playShuffle}
                    >
                        <span class="material-symbols-rounded text-xl">shuffle</span>
                        Shuffle
                    </button>

                    <button 
                        class="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-onPrimary font-semibold text-label-large hover:bg-primary/90 active:scale-95 transition-all shadow-md"
                        disabled={!songIds.length}
                        onclick={() => player.playTrack(0, songIds)}
                    >
                        <span class="material-symbols-rounded text-xl fill-1">play_arrow</span>
                        Play
                    </button>

                    <button 
                        class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surfaceContainerHighest/40 backdrop-blur-xl border border-outlineVariant/20 text-onSurface hover:bg-surfaceContainerHighest/70 active:scale-95 transition-all shadow-sm"
                        disabled={!songIds.length}
                    >
                        <span class="material-symbols-rounded text-xl">add</span>
                    </button>
                </div>
            </section>

            <!-- Embedded Track List Container -->
            <div class="mt-8 rounded-3xl bg-surfaceContainerLow/30 backdrop-blur-lg p-2 sm:p-4 border border-outlineVariant/10">
                <TracksListContainer items={songIds} />
            </div>
        {/if}
    </div>
</main>
