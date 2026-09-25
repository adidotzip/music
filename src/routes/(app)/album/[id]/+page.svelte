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

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
    {#if loading}
        <div class="my-auto flex min-h-80 items-center justify-center">
            <div class="text-title-md text-onSurfaceVariant opacity-60">Loading album...</div>
        </div>
    {:else if error}
        <div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
            <div class="text-title-lg text-error">{error}</div>
            <Button onclick={() => void load()}>Retry</Button>
        </div>
    {:else}
        <div class="flex flex-col gap-6">
            <!-- Apple Music-style Hero Header with Material Aesthetics -->
            <section class="flex flex-col items-center pt-4 text-center">
                <!-- Main Artwork Card with Elevation -->
                <div class="relative shadow-lg transition-transform hover:scale-[1.02] duration-200 rounded-2xl overflow-hidden bg-surfaceContainer">
                    <Artwork src={artwork} fallbackIcon="album" class="size-64 sm:size-72 shrink-0 rounded-2xl object-cover" />
                </div>

                <!-- Title & Artist Metadata -->
                <div class="mt-5 flex flex-col items-center px-2 max-w-xl">
                    <h1 class="text-headline-medium sm:text-display-small font-bold text-onSurface tracking-tight">
                        {albumName}
                    </h1>
                    
                    {#if artistName}
                        <button class="mt-1 text-title-medium font-semibold text-primary hover:underline">
                            {artistName}
                        </button>
                    {/if}

                    <div class="mt-1 text-body-medium text-onSurfaceVariant">
                        Album • {songIds.length} {songIds.length === 1 ? 'song' : 'songs'}
                    </div>
                </div>

                <!-- Material Dynamic Action Bar (Shuffle / Play / Add) -->
                <div class="mt-6 flex items-center justify-center gap-3 w-full max-w-xs">
                    <button 
                        class="flex-1 flex items-center justify-center gap-2 h-12 rounded-full bg-secondaryContainer text-onSecondaryContainer font-medium text-label-large hover:bg-secondaryContainer/80 transition-colors"
                        disabled={!songIds.length}
                        onclick={playShuffle}
                    >
                        <span class="material-symbols-rounded text-xl">shuffle</span>
                        Shuffle
                    </button>

                    <button 
                        class="flex-1 flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-onPrimary font-medium text-label-large shadow-sm hover:shadow-md hover:bg-primary/90 transition-all"
                        disabled={!songIds.length}
                        onclick={() => player.playTrack(0, songIds)}
                    >
                        <span class="material-symbols-rounded text-xl">play_arrow</span>
                        Play
                    </button>
                </div>
            </section>

            <!-- Divider Line -->
            <hr class="border-outlineVariant opacity-40 my-2" />

            <!-- Track List Section -->
            <TracksListContainer items={songIds} />
        </div>
    {/if}
</main>
