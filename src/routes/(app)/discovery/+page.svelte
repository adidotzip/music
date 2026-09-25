<script lang="ts">
    import { onMount } from 'svelte'
    import { goto } from '$app/navigation'
    import Artwork from '$lib/components/Artwork.svelte'
    import BackButton from '$lib/components/BackButton.svelte'
    import Button from '$lib/components/Button.svelte'
    import Header from '$lib/components/Header.svelte'
    import IconButton from '$lib/components/IconButton.svelte'
    import Icon from '$lib/components/icon/Icon.svelte'
    import MenuButton from '$lib/components/MenuButton.svelte'
    import Separator from '$lib/components/Separator.svelte'
    import Spinner from '$lib/components/Spinner.svelte'
    import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
    import { useSetOverlaySnippet } from '$lib/layout-bottom-bar.svelte'
    import { registerRemoteTrack } from '$lib/library/get/value.ts'
    import { UNKNOWN_ITEM } from '$lib/library/types.ts'
    import {
        cacheDiscoveryRecommendations,
        getCachedDiscoveryRecommendations,
    } from '$lib/services/discovery-cache.ts'
    import { generateStableId } from '$lib/services/jiosaavn.ts'
    import { getRecentlyPlayed } from '$lib/services/library.ts'
    import {
        type DiscoveryResource,
        type DiscoveryTrack,
        getSongsForArtist,
        normalizeTracks,
        parseDiscoveryResults,
        searchDiscovery,
        spicyamll,
    } from '$lib/services/spicyamll.ts'

    type DiscoveryItem = DiscoveryResource

    const player = usePlayer()

    let query = $state('')
    let loading = $state(false)
    let loadingRecommendations = $state(false)
    let error = $state<string | null>(null)
    let searched = $state(false)

    let results = $state<DiscoveryItem[]>([])
    let topPicks = $state<DiscoveryItem[]>([])
    let recommendations = $state<DiscoveryItem[]>([])
    let recentlyPlayed = $state<DiscoveryItem[]>([])

    let selectedDetail = $state<{
        type: 'album' | 'artist'
        id: string
        name: string
        artist?: string
        artUrl?: string
    } | null>(null)
    let detailLoading = $state(false)
    let detailTrackIds = $state<number[]>([])

    const getOrRegisterRemoteTrack = (input: DiscoveryTrack | DiscoveryResource): number => {
        const key = `spicyamll:${input.id}`
        const id = generateStableId(key)

        const isResource = 'artUrl' in input
        const name = input.name || 'Unknown'
        const artistName = isResource ? input.artist : input.artist
        const albumName = isResource ? input.album : input.album
        const imageUrl = isResource ? input.artUrl : input.image
        const rawDuration = !isResource && input.duration ? input.duration : 0
        const yearStr = !isResource && input.year ? String(input.year) : UNKNOWN_ITEM

        registerRemoteTrack({
            id,
            remoteId: Number(input.id) || 0,
            streaming: true,
            uuid: key,
            name,
            album: albumName || UNKNOWN_ITEM,
            artists: artistName ? [artistName] : ['Unknown Artist'],
            year: yearStr,
            duration: rawDuration,
            genre: [],
            trackNo: 0,
            trackOf: 0,
            discNo: 0,
            discOf: 0,
            language: undefined,
            image: imageUrl ? { optimized: false, small: imageUrl, full: imageUrl } : undefined,
            primaryColor: undefined,
            file: undefined,
            directory: undefined,
            fileName: undefined,
            scannedAt: Date.now(),
            url: spicyamll.streamUrl(input.id, {
                codec: 'aac',
                fallback: true,
                language: 'en-US',
            }),
            favorite: false,
            type: 'track',
        })

        return id
    }

    let songResults = $derived(results.filter((item) => item.type === 'song'))
    let albumResults = $derived(results.filter((item) => item.type === 'album'))
    let artistResults = $derived(results.filter((item) => item.type === 'artist'))

    let songTrackIds = $derived(songResults.map((s) => getOrRegisterRemoteTrack(s)))
    let recSongTrackIds = $derived(
        recommendations.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )
    let topPicksSongTrackIds = $derived(
        topPicks.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )
    let recentlyPlayedTrackIds = $derived(
        recentlyPlayed.filter((r) => r.type === 'song').map((s) => getOrRegisterRemoteTrack(s)),
    )

    const cleanArtUrl = (url: unknown) => {
        if (typeof url !== 'string' || !url) return 'favicon.svg'
        const value = url
            .replace(/\{w\}/g, '600')
            .replace(/\{h\}/g, '600')
            .replace(/\{c\}/g, 'bb')
            .replace(/\{f\}/g, 'jpg')
            .replace(/\d+x\d+bb\./, '600x600bb.')
        return /^https?:\/\//i.test(value) ? value : 'favicon.svg'
    }

    const shuffle = <T,>(items: T[]) => {
        const out = [...items]
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[out[i], out[j]] = [out[j], out[i]]
        }
        return out
    }

    const dedupeItems = (items: DiscoveryItem[]) => {
        const seen = new Set<string>()
        return items.filter((item) => {
            const key = `${item.type}:${item.id}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    const parseRecommendationSearch = (input: unknown): DiscoveryItem[] => parseDiscoveryResults(input)

    const loadRecommendations = async () => {
        loadingRecommendations = true
        try {
            const cached = getCachedDiscoveryRecommendations()
            const history = getRecentlyPlayed(100)

            recentlyPlayed = history.slice(0, 10).map((track) => ({
                type: 'song',
                id: String(track.trackId || track.id),
                name: track.name,
                artist: track.artist,
                album: track.album,
                artUrl: cleanArtUrl(track.artUrl),
            }))

            if (cached) {
                topPicks = cached.topPicks
                recommendations = cached.recommendations
                return
            }
            if (history.length) {
                const latest = history[0]
                const latestItem: DiscoveryItem = {
                    type: 'song',
                    id: String(latest.trackId || latest.id),
                    name: latest.name,
                    artist: latest.artist,
                    album: latest.album,
                    artUrl: cleanArtUrl(latest.artUrl),
                }
                const artists = [...new Set(history.map((track) => track.artist.trim()).filter(Boolean))].slice(0, 4)
                const groups = await Promise.all(artists.map(async (artist) => {
                    try { return parseRecommendationSearch(await spicyamll.search({ term: artist, limit: 15 })) } catch { return [] }
                }))
                topPicks = [latestItem, ...shuffle(dedupeItems(groups.flat()).filter((x) => !(x.type === 'song' && x.id === latestItem.id))).slice(0, 10)]
            } else {
                topPicks = []
            }

            const listenedIds = new Set(history.map((track) => String(track.trackId || track.id)))
            const artists = [...new Set(history.map((track) => track.artist.trim()).filter(Boolean))].slice(0, 8)
            const queries = artists.length ? artists : ['Hits', 'Pop', 'Rock', 'Electronic']
            const groups = await Promise.all([
                ...queries.map(async (term) => {
                    try { return parseRecommendationSearch(await spicyamll.search({ term, limit: 25 })) } catch { return [] }
                }),
                (async () => {
                    try { return parseRecommendationSearch(await spicyamll.recommendations({ name: 'search-landing' })) } catch { return [] }
                })(),
            ])
            recommendations = shuffle(dedupeItems(groups.flat()).filter((item) => item.type !== 'song' || !listenedIds.has(item.id))).slice(0, 90)
            cacheDiscoveryRecommendations(topPicks, recommendations)
        } catch (e) {
            console.warn('[Discovery] Recommendations failed:', e)
        } finally {
            loadingRecommendations = false
        }
    }

    const search = async () => {
        const term = query.trim()
        if (!term) return
        loading = true
        error = null
        searched = true
        results = []
        selectedDetail = null

        try {
            results = await searchDiscovery(term)
        } catch (e) {
            error = e instanceof Error ? e.message : 'Unable to search SpicyAMLL'
        } finally {
            loading = false
        }
    }

    const viewAlbum = async (album: DiscoveryItem) => {
        selectedDetail = {
            type: 'album',
            id: album.id,
            name: album.name,
            artist: album.artist,
            artUrl: album.artUrl,
        }
        detailLoading = true
        detailTrackIds = []
        try {
            const tracks = await spicyamll.albumTracks(album.id)
            detailTrackIds = tracks.map((t) => getOrRegisterRemoteTrack(t))
        } catch {
            detailTrackIds = []
        } finally {
            detailLoading = false
        }
    }

    const viewArtist = async (artist: DiscoveryItem) => {
        await goto(`/artist/${encodeURIComponent(artist.id)}?name=${encodeURIComponent(artist.name)}`)
    }

    const SEARCH_STATE_KEY = 'adi_music_discovery_search_v1'
    let restoreSearchDone = false

    const persistSearchState = () => {
        if (typeof window === 'undefined' || !searched || !results.length) return
        try {
            window.sessionStorage.setItem(
                SEARCH_STATE_KEY,
                JSON.stringify({ query, results, searched: true }),
            )
        } catch {
            // Ignore storage failures.
        }
    }

    const restoreSearchState = () => {
        if (typeof window === 'undefined' || restoreSearchDone) return
        restoreSearchDone = true
        try {
            const raw = window.sessionStorage.getItem(SEARCH_STATE_KEY)
            if (!raw) return
            const saved = JSON.parse(raw) as {
                query?: unknown
                results?: unknown
                searched?: unknown
            }
            if (!(saved.searched && Array.isArray(saved.results))) return
            query = typeof saved.query === 'string' ? saved.query : ''
            results = saved.results as DiscoveryItem[]
            searched = true
        } catch {
            window.sessionStorage.removeItem(SEARCH_STATE_KEY)
        }
    }

    $effect(() => {
        if (searched && results.length > 0) {
            persistSearchState()
        }
    })

    onMount(() => {
        restoreSearchState()
        void loadRecommendations()
    })
</script>

{#snippet navItemsSnippet(className: string)}
    <Button
        as="a"
        href="/library/tracks"
        kind="blank"
        tooltip={m.tracks()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="musicNote" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/albums"
        kind="blank"
        tooltip={m.albums()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="album" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/artists"
        kind="blank"
        tooltip={m.artists()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="person" />
        </div>
    </Button>

    <Button
        as="a"
        href="/library/playlists"
        kind="blank"
        tooltip={m.playlists()}
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full p-2">
            <Icon type="playlist" />
        </div>
    </Button>

    <Button
        as="a"
        href="/discovery"
        kind="blank"
        tooltip="Discovery"
        class={['flex shrink-0 items-center justify-center', className]}
    >
        <div class="flex items-center justify-center rounded-full bg-secondaryContainer p-2 text-onSecondaryContainer">
            <Icon type="compass" />
        </div>
    </Button>
{/snippet}

{#snippet layoutBottom()}
    <div
        class="pointer-events-auto grid h-16 w-full grid-cols-[repeat(auto-fit,minmax(0,1fr))] bg-surfaceContainer sm:hidden active-view-regular:view-name-[bottom-bar]"
    >
        {@render navItemsSnippet('h-full')}
    </div>
{/snippet}

{useSetOverlaySnippet('bottom-bar', () => layoutBottom)}

<Header title={selectedDetail ? selectedDetail.name : 'Discovery'} noBackButton>
    {#if !selectedDetail && searched}
        <BackButton
            class="mr-auto"
            onback={() => {
                query = ''
                results = []
                searched = false
                error = null
            }}
        />
    {/if}
    {#if selectedDetail}
        <BackButton
            class="mr-auto"
            onback={() => {
                selectedDetail = null
            }}
        />
    {/if}
</Header>

<div class="desktop-sidebar fixed z-1 mt-20 hidden h-max w-max flex-col items-center gap-2 sm:flex [@media(max-height:500px)]:mt-2">
    {@render navItemsSnippet('h-14 w-20')}
</div>

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
    {#if !selectedDetail}
        <form
            class="@container sticky top-2 z-1 mt-2 mb-4 ml-auto flex w-full max-w-125 items-center gap-1 rounded-lg border border-primary/10 bg-surfaceContainerHighest px-2 @sm:gap-2"
            onsubmit={(event) => {
                event.preventDefault()
                void search()
            }}
        >
            <input
                bind:value={query}
                type="text"
                name="search"
                placeholder="Search tracks, artists, albums"
                class="h-12 w-60 grow bg-transparent pl-2 text-body-md placeholder:text-onSurface/54 focus:outline-none"
            />

            <IconButton icon="magnify" tooltip="Search" type="submit" />

            <Separator vertical class="my-auto hidden h-6 @sm:flex" />

            <MenuButton
                ariaLabel={m.libraryOpenApplicationMenu()}
                tooltip={m.more()}
                menuItems={() => [
                    { label: m.settings(), action: () => void goto('/settings') },
                    { label: m.about(), action: () => void goto('/about') },
                ]}
                width={200}
            />
        </form>
    {/if}

    {#if selectedDetail}
        <div class="@container flex grow flex-col pb-4">
            <section
                class="relative flex w-full flex-col items-center justify-center gap-6 overflow-clip py-4 @2xl:min-h-60 @2xl:flex-row"
            >
                <Artwork
                    src={selectedDetail.artUrl}
                    fallbackIcon={selectedDetail.type === 'album' ? 'album' : 'person'}
                    class="h-49 shrink-0 rounded-2xl @2xl:h-full"
                />

                <div
                    class="relative z-0 flex size-full flex-col overflow-clip rounded-2xl bg-surfaceContainerHigh"
                >
                    <div class="flex grow flex-col p-4">
                        <div class="flex items-center gap-2">
                            <Icon
                                type={selectedDetail.type === 'album' ? 'album' : 'person'}
                                class="size-10 text-onSurface/54"
                            />
                            <h1 class="text-headline-md">{selectedDetail.name}</h1>
                        </div>

                        {#if selectedDetail.artist}
                            <div class="grid w-full overflow-hidden text-body-lg">
                                <div class="truncate">
                                    {selectedDetail.artist}
                                </div>
                            </div>
                        {/if}

                        <div class="mt-1 text-onSurfaceVariant">
                            {m.libraryTracksCount({ count: detailTrackIds.length })}
                        </div>
                    </div>

                    <div class="mt-auto flex items-center gap-2 py-4 pr-2 pl-4">
                        <Button
                            kind="filled"
                            class="my-1"
                            disabled={detailTrackIds.length === 0}
                            onclick={() => {
                                player.playTrack(0, detailTrackIds)
                            }}
                        >
                            {m.play()}
                        </Button>

                        <Button
                            kind="flat"
                            class="my-1 mr-auto"
                            disabled={detailTrackIds.length === 0}
                            onclick={() => {
                                player.playTrack(0, detailTrackIds, {
                                    shuffle: true,
                                })
                            }}
                        >
                            {m.shuffle()}
                            <Icon type="shuffle" />
                        </Button>

                        <Button
                            kind="blank"
                            onclick={() => {
                                selectedDetail = null
                            }}
                        >
                            {m.dismiss()}
                        </Button>
                    </div>
                </div>
            </section>

            {#if detailLoading}
                <div class="flex min-h-40 items-center justify-center">
                    <Spinner class="size-8" />
                </div>
            {:else}
                <TracksListContainer items={detailTrackIds} />
            {/if}
        </div>
    {:else if error}
        <div class="my-auto flex flex-col items-center p-8 text-center text-error">
            <div class="text-title-lg">{error}</div>
        </div>
    {:else if loading}
        <div class="my-auto flex min-h-60 flex-col items-center justify-center gap-4 text-center opacity-70">
            <Spinner class="size-10" />
            <div class="text-title-md">Searching catalog...</div>
        </div>
    {:else if searched && results.length === 0}
        <div class="relative m-auto flex flex-col items-center text-center py-12">
            <Icon type="magnify" class="my-auto size-35 opacity-54" />
            <div class="text-body-lg">{m.libraryNoResults()}</div>
            <div>{m.libraryNoResultsExplanation()}</div>
        </div>
    {:else if results.length > 0}
        <div class="flex flex-col gap-8 pb-8">
            {#if songResults.length}
                <section class="flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Songs</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{songResults.length}</span>
                    </div>
                    <TracksListContainer
                        items={songTrackIds}
                        onItemClick={({ index, items }) => {
                            player.playTrack(index, items)
                        }}
                    />
                </section>
            {/if}

            {#if albumResults.length}
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Albums</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{albumResults.length}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each albumResults as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-lg bg-surfaceContainerHigh text-left"
                                onclick={() => void viewAlbum(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="album"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                    <div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || 'Unknown Artist'}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}

            {#if artistResults.length}
                <section class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <h2 class="text-title-lg font-bold text-onSurface">Artists</h2>
                        <span class="text-body-sm text-onSurfaceVariant/70">{artistResults.length}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each artistResults as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-lg bg-surfaceContainerHigh text-left"
                                onclick={() => void viewArtist(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="person"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    {:else}
        <div class="flex flex-col gap-8 pb-8">
            {#if recentlyPlayedTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recently Played</h2>
                    <TracksListContainer items={recentlyPlayedTrackIds} />
                </section>
            {/if}

            {#if topPicksSongTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Top Picks For You</h2>
                    <TracksListContainer items={topPicksSongTrackIds} />
                </section>
            {/if}

            {#if recSongTrackIds.length}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended For You</h2>
                    <TracksListContainer items={recSongTrackIds.slice(0, 20)} />
                </section>
            {:else if loadingRecommendations}
                <div class="flex min-h-40 flex-col items-center justify-center gap-2 text-center opacity-60">
                    <Spinner class="size-6" />
                    <div class="text-body-md">Building recommendations...</div>
                </div>
            {/if}

            {#if recommendations.some((r) => r.type === 'album')}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended Albums</h2>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each recommendations.filter((r) => r.type === 'album').slice(0, 12) as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-lg bg-surfaceContainerHigh text-left"
                                onclick={() => void viewAlbum(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="album"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                    <div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || 'Unknown Artist'}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}

            {#if recommendations.some((r) => r.type === 'artist')}
                <section class="flex flex-col gap-3">
                    <h2 class="text-title-lg font-bold text-onSurface">Recommended Artists</h2>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {#each recommendations.filter((r) => r.type === 'artist').slice(0, 12) as item (item.id)}
                            <button
                                type="button"
                                class="interactable flex flex-col overflow-hidden rounded-lg bg-surfaceContainerHigh text-left"
                                onclick={() => void viewArtist(item)}
                            >
                                <Artwork
                                    src={item.artUrl}
                                    fallbackIcon="person"
                                    class="aspect-square w-full rounded-[inherit]"
                                />
                                <div class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant">
                                    <div class="truncate text-body-md font-medium text-onSurface">{item.name}</div>
                                </div>
                            </button>
                        {/each}
                    </div>
                </section>
            {/if}
        </div>
    {/if}
</main>
