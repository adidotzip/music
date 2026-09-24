<script lang="ts">import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { getDatabase } from '$lib/db/database.ts'
	import { getRecentlyPlayed } from '$lib/services/library.ts'
import { downloadSongToLibrary, getFavoriteArtistIds, toggleFavoriteArtist } from '$lib/services/online-library.ts'
	import { usePlayer } from '$lib/stores/player/use-store.ts'
	import { normalizeTracks, parseDiscoveryResults, searchArtists, searchDiscovery, spicyamll, getSongsForArtist, type DiscoveryResource } from '$lib/services/spicyamll.ts'

	type DiscoveryItem = DiscoveryResource

	const player = usePlayer()
	let query = $state('')
	let loading = $state(false)
	let loadingRecommendations = $state(false)
	let error = $state<string | null>(null)
	let results = $state<DiscoveryItem[]>([])
	let searched = $state(false)
	let topPicks = $state<DiscoveryItem[]>([])
	let recommendations = $state<DiscoveryItem[]>([])
	let recentlyPlayed = $state<DiscoveryItem[]>([])
	let favoriteArtists = $state<string[]>([])
	let downloading = $state<string[]>([])
	let selectedAlbum = $state<DiscoveryItem | null>(null)
	let albumTracks = $state<DiscoveryTrack[]>([])
	let selectedArtist = $state<DiscoveryItem | null>(null)
	let artistTracks = $state<DiscoveryTrack[]>([])
	let artistInfo = $state<DiscoveryItem | null>(null)
	let songResults = $derived(results.filter((item) => item.type === 'song'))
	let albumResults = $derived(results.filter((item) => item.type === 'album'))
	let artistResults = $derived(results.filter((item) => item.type === 'artist'))

	const remoteId = (id: number, index: number) => -Math.max(1, Math.abs(id || index + 1))

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

	const parseRecommendationSearch = (input: unknown): DiscoveryItem[] => parseDiscoveryResults(input)

	const loadRecommendations = async () => {
		loadingRecommendations = true
		try {
			const history = getRecentlyPlayed(100)
			recentlyPlayed = history.slice(0, 10).map((track) => ({
				type: 'song',
				id: track.trackId || track.id,
				name: track.name,
				artist: track.artist,
				album: track.album,
				artUrl: cleanArtUrl(track.artUrl),
			}))

			if (!history.length) {
				topPicks = []
			} else {
				const latest = history[0]
				const latestItem: DiscoveryItem = {
					type: 'song',
					id: latest.trackId || latest.id,
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
		} catch (e) {
			console.warn('[Discovery] Recommendations failed:', e)
		} finally {
			loadingRecommendations = false
		}
	}

	const playTrack = async (item: ReturnType<typeof normalizeTracks>[number], index: number) => {
		let track = item
		try {
			const detail = await spicyamll.song(item.id)
			const normalized = normalizeTracks(detail)
			if (normalized[0]) track = { ...item, ...normalized[0] }
		} catch {}

		const db = await getDatabase()
		const localTrack = await db.getFromIndex('tracks', 'uuid', `spicyamll:${track.id}`)
		if (localTrack) {
			player.playTrack(0, [localTrack.id])
			return
		}

		const id = remoteId(track.id, index)
		registerRemoteTrack({
			id,
			uuid: `spicyamll:${track.id}`,
			name: track.name,
			album: track.album || track.albumName || '~\\0unknown',
			artists: track.artists?.length ? track.artists : [track.artist || 'Unknown Artist'],
			year: track.year ? String(track.year) : '~\\0unknown',
			duration: track.duration ?? 0,
			genre: [],
			trackNo: 0,
			trackOf: 0,
			discNo: 0,
			discOf: 0,
			language: undefined,
			image: track.image ? { optimized: false, small: track.image, full: track.image } : undefined,
			primaryColor: undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(track.id, { codec: 'atmos', fallback: false, language: 'en-US' }),
			favorite: false,
			type: 'track',
		})
		player.playTrack(0, [id])
		favoriteArtists = getFavoriteArtistIds()
	void loadRecommendations()
	}

	const addSong = async (item: DiscoveryTrack) => {
		if (downloading.includes(String(item.id))) return
		downloading = [...downloading, String(item.id)]
		try {
			await downloadSongToLibrary(item.id, {
				name: item.name,
				album: item.album || item.albumName || '~\\0unknown',
				artists: item.artists?.length ? item.artists : [item.artist || 'Unknown Artist'],
				year: item.year ? String(item.year) : '~\\0unknown',
				duration: item.duration ?? 0,
				genre: [],
				trackNo: 0,
				trackOf: 0,
				discNo: 0,
				discOf: 0,
				image: item.image ? { optimized: false, small: item.image, full: item.image } : undefined,
			})
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to add song'
		} finally {
			downloading = downloading.filter((id) => id !== String(item.id))
		}
	}

type DiscoveryTrack = ReturnType<typeof normalizeTracks>[number]

	const addDiscoverySong = async (item: DiscoveryItem) => {
		const track = normalizeTracks({
			id: item.id,
			name: item.name,
			artist: item.artist,
			album: item.album,
			image: item.artUrl,
		})[0]
		if (track) await addSong(track)
	}

	const viewAlbum = async (item: DiscoveryItem) => {
		selectedAlbum = item
		try {
			albumTracks = normalizeTracks(await spicyamll.album({ album: item.id, l: 'en-US', storefront: 'us' }))
		} catch {
			albumTracks = []
		}
	}

	const viewArtist = async (artist: string, artistId: string | undefined) => {
		try {
			let id = artistId
			let info: DiscoveryItem | null = artistId
				? { type: 'artist', id: artistId, name: artist, artist: artist, album: '', artUrl: 'favicon.svg' }
				: null
			if (!id) {
				const found = await searchArtists(artist)
				id = found[0] ? String(found[0].id) : undefined
				info = found[0] ? {
					type: 'artist', id, name: found[0].name, artist: found[0].artist || artist,
					album: '', artUrl: found[0].image || 'favicon.svg'
				} : null
			}
			if (!id) return
			selectedArtist = info
			artistInfo = info
			artistTracks = await getSongsForArtist(id, artist)
		} catch {
			artistTracks = []
		}
	}

	const toggleArtist = (id: string | number) => {
		toggleFavoriteArtist(id)
		favoriteArtists = getFavoriteArtistIds()
	}

	const playDiscoveryItem = async (item: DiscoveryItem, index: number) => {
		if (item.type === 'album') return viewAlbum(item)
		if (item.type === 'artist') return viewArtist(item.name, item.id)
		if (item.type === 'song') {
			const tracks = normalizeTracks(await spicyamll.song(item.id))
			if (tracks[0]) return playTrack(tracks[0], index)
		}

		if (item.type === 'artist') {
			const tracks = await getSongsForArtist(item.id, item.name)
			if (tracks[0]) return playTrack(tracks[0], index)
		}

		if (item.type === 'album') {
			const tracks = normalizeTracks(await spicyamll.album({ album: item.id, l: 'en-US' }))
			if (tracks[0]) return playTrack(tracks[0], index)
		}
	}

	const search = async () => {
		const term = query.trim()
		if (!term) return
		loading = true
		error = null
		searched = true
		results = []

		try {
			results = await searchDiscovery(term)

		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to search SpicyAMLL'
		} finally {
			loading = false
		}
	}

	const formatDuration = (seconds: number) => {
		if (!seconds || !Number.isFinite(seconds)) return ''
		const minutes = Math.floor(seconds / 60)
		const remaining = Math.floor(seconds % 60)
		return `${minutes}:${remaining.toString().padStart(2, '0')}`
	}

	void loadRecommendations()
</script>

<Header title="Discovery" noBackButton>
	<Button as="a" href="/library/tracks" kind="blank" tooltip="Library">
		<Icon type="library" />
	</Button>
</Header>

<main class="mx-auto flex w-full max-w-(--app-max-content-width) flex-col gap-8 px-4 pt-8 pb-32">
	<section class="flex flex-col gap-3">
		<div class="text-headline-large font-bold">Discover music</div>
		<div class="text-body-lg opacity-70">
			Search songs, artists and albums from the Apple Music catalog.
		</div>

		<form
			class="mt-2 flex w-full max-w-175 items-center gap-2 rounded-2xl border border-primary/10 bg-surfaceContainerHighest p-2"
			onsubmit={(event) => {
				event.preventDefault()
				void search()
			}}
		>
			<Icon type="magnify" class="ml-2 shrink-0 opacity-60" />
			<input
				bind:value={query}
				class="h-12 min-w-0 grow bg-transparent px-2 text-body-lg outline-none"
				placeholder="Search songs, artists, albums..."
				aria-label="Search music"
			/>
			<Button type="submit" disabled={loading || !query.trim()}>
				{loading ? 'Searching…' : 'Search'}
			</Button>
		</form>
	</section>

	{#if error}
		<div class="rounded-2xl border border-error/30 bg-errorContainer p-4 text-onErrorContainer">
			{error}
		</div>
	{:else if loading}
		<div class="flex min-h-50 items-center justify-center opacity-70">Searching the catalog…</div>
	{:else if searched && results.length === 0}
		<div class="flex min-h-50 flex-col items-center justify-center gap-2 text-center opacity-70">
			<Icon type="magnify" class="size-20" />
			<div class="text-title-lg">No results</div>
			<div>Try a different artist, album, or song.</div>
		</div>
	{:else if results.length > 0}
		<section class="flex flex-col gap-8">
			{#if songResults.length}
				<div class="flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg font-bold">Songs</h2>
						<span class="text-body-sm opacity-50">{songResults.length}</span>
					</div>
					{#each songResults as item, index (item.id)}
						<article class="group flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surfaceContainerHighest">
							<Artwork src={item.artUrl} alt={item.name} class="size-14 shrink-0 rounded-xl" fallbackIcon="musicNote" />
							<div class="min-w-0 grow">
								<div class="truncate text-title-sm">{item.name}</div>
								<div class="truncate text-body-sm opacity-60">{item.artist || 'Unknown Artist'}</div>
							</div>
							<div class="hidden shrink-0 gap-1 group-hover:flex sm:flex">
								<Button onclick={() => void playDiscoveryItem(item, index)} kind="blank" tooltip="Play"><Icon type="play" /></Button>
								<Button onclick={() => void addDiscoverySong(item)} kind="blank" tooltip="Add to library">{downloading.includes(item.id) ? '…' : '+'}</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}

			{#if albumResults.length}
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between"><h2 class="text-title-lg font-bold">Albums</h2><span class="text-body-sm opacity-50">{albumResults.length}</span></div>
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
						{#each albumResults as item (item.id)}
							<button class="min-w-0 text-left" onclick={() => void viewAlbum(item)}>
								<Artwork src={item.artUrl} alt={item.name} class="aspect-square w-full rounded-2xl" fallbackIcon="musicNote" />
								<div class="mt-2 truncate text-title-sm">{item.name}</div>
								<div class="truncate text-body-sm opacity-60">{item.artist || 'Unknown Artist'}</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if artistResults.length}
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between"><h2 class="text-title-lg font-bold">Artists</h2><span class="text-body-sm opacity-50">{artistResults.length}</span></div>
					<div class="flex flex-col gap-1">
						{#each artistResults as item (item.id)}
							<div class="flex items-center gap-3 rounded-2xl p-3 hover:bg-surfaceContainerHighest">
								<button class="shrink-0" onclick={() => void viewArtist(item.name, item.id)} aria-label="View artist">
									<Artwork src={item.artUrl} alt={item.name} class="size-14 rounded-full" fallbackIcon="musicNote" />
								</button>
								<button class="min-w-0 grow text-left" onclick={() => void viewArtist(item.name, item.id)}>
									<div class="truncate text-title-sm">{item.name}</div>
									<div class="text-body-sm opacity-60">{item.genre || 'Artist'}</div>
								</button>
								<Button onclick={() => toggleArtist(item.id)} kind="blank">{favoriteArtists.includes(item.id) ? '★' : '☆'}</Button>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	{/if}

	{#if selectedAlbum}
		<section class="rounded-3xl bg-surfaceContainerHighest p-5">
			<div class="flex items-center gap-4">
				<Artwork src={selectedAlbum.artUrl || undefined} alt={selectedAlbum.name} class="size-24 rounded-2xl" fallbackIcon="musicNote" />
				<div class="min-w-0 grow"><div class="text-title-lg font-bold">{selectedAlbum.name}</div><div class="opacity-65">{selectedAlbum.artist || 'Unknown Artist'}</div></div>
				<Button onclick={() => { selectedAlbum = null; albumTracks = [] }} kind="blank">Close</Button>
			</div>
			<div class="mt-4 flex flex-col gap-1">
				{#each albumTracks as track, index (track.id)}
					<div class="flex items-center gap-3 rounded-xl p-2 hover:bg-surface">
						<div class="min-w-0 grow"><div class="truncate">{track.name}</div><div class="text-body-sm opacity-60">{track.artist}</div></div>
						<Button onclick={() => void playTrack(track, index)} kind="blank"><Icon type="play" /></Button>
						<Button onclick={() => void addSong(track)} kind="blank">+</Button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if selectedArtist}
		<section class="rounded-3xl bg-surfaceContainerHighest p-5">
			<div class="flex items-center justify-between gap-4"><div><div class="text-title-lg font-bold">{selectedArtist.name}</div><div class="text-body-sm opacity-60">Artist</div></div><Button onclick={() => { selectedArtist = null; artistInfo = null; artistTracks = [] }} kind="blank">Close</Button></div>
			<div class="mt-4 flex flex-col gap-1">{#each artistTracks as track, index (track.id)}<div class="flex items-center gap-3 rounded-xl p-2"><div class="min-w-0 grow"><div class="truncate">{track.name}</div><div class="text-body-sm opacity-60">{track.album}</div></div><Button onclick={() => void playTrack(track, index)} kind="blank"><Icon type="play" /></Button><Button onclick={() => void addSong(track)} kind="blank">+</Button></div>{/each}</div>
		</section>
	{/if}
	{#if !searched}
		{#if recentlyPlayed.length}
			<section class="flex flex-col gap-3">
				<div class="text-title-lg font-bold">Recently Played</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
					{#each recentlyPlayed as item (item.id)}
						<button class="min-w-0 text-left" onclick={() => void playDiscoveryItem(item, 0)}>
							<Artwork src={item.artUrl} alt={item.name} class="aspect-square w-full rounded-2xl" fallbackIcon="musicNote" />
							<div class="mt-2 truncate text-title-sm">{item.name}</div>
							<div class="truncate text-body-sm opacity-60">{item.artist}</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if topPicks.length}
			<section class="flex flex-col gap-3">
				<div class="text-title-lg font-bold">Top Picks For You</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
					{#each topPicks as item (item.type + item.id)}
						<button class="min-w-0 text-left" onclick={() => void playDiscoveryItem(item, 0)}>
							<Artwork src={item.artUrl} alt={item.name} class="aspect-square w-full rounded-2xl" fallbackIcon="musicNote" />
							<div class="mt-2 truncate text-title-sm">{item.name}</div>
							<div class="truncate text-body-sm opacity-60">{item.artist || item.type}</div>
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if recommendations.length}
			<section class="flex flex-col gap-3">
				<div class="text-title-lg font-bold">Recommended For You</div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
					{#each recommendations.slice(0, 20) as item (item.type + item.id)}
						<button class="min-w-0 text-left" onclick={() => void playDiscoveryItem(item, 0)}>
							<Artwork src={item.artUrl} alt={item.name} class="aspect-square w-full rounded-2xl" fallbackIcon="musicNote" />
							<div class="mt-2 truncate text-title-sm">{item.name}</div>
							<div class="truncate text-body-sm opacity-60">{item.artist || item.type}</div>
						</button>
					{/each}
				</div>
			</section>
		{:else if loadingRecommendations}
			<div class="py-8 text-center opacity-60">Building your recommendations…</div>
		{/if}
	{/if}
</main>
