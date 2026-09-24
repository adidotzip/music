<script lang="ts">
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { getRecentlyPlayed, recordRecentTrack } from '$lib/services/library.ts'
	import { usePlayer } from '$lib/stores/player/use-store.ts'
	import { normalizeTracks, searchCatalog, spicyamll, getSongsForArtist } from '$lib/services/spicyamll.ts'

	type DiscoveryItem = {
		type: 'song' | 'album' | 'artist'
		id: string
		name: string
		artist: string
		album: string
		artUrl: string
	}

	const player = usePlayer()
	let query = $state('')
	let loading = $state(false)
	let loadingRecommendations = $state(false)
	let error = $state<string | null>(null)
	let results = $state<ReturnType<typeof normalizeTracks>>([])
	let searched = $state(false)
	let topPicks = $state<DiscoveryItem[]>([])
	let recommendations = $state<DiscoveryItem[]>([])
	let recentlyPlayed = $state<DiscoveryItem[]>([])

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

	const parseRecommendationSearch = (input: unknown): DiscoveryItem[] => {
		const root = input && typeof input === 'object' ? input as Record<string, unknown> : {}
		const results = (root.results ?? (root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>).results : undefined)) as Record<string, unknown> | undefined
		if (!results) return []

		const parse = (key: 'songs' | 'albums' | 'artists', type: DiscoveryItem['type']) => {
			const group = results[key]
			const data = group && typeof group === 'object' ? (group as Record<string, unknown>).data : []
			if (!Array.isArray(data)) return []
			return data.map((value) => {
				const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
				const attrs = item.attributes && typeof item.attributes === 'object' ? item.attributes as Record<string, unknown> : {}
				const artwork = attrs.artwork && typeof attrs.artwork === 'object' ? attrs.artwork as Record<string, unknown> : {}
				const id = String(attrs.trackId ?? attrs.id ?? item.trackId ?? item.id ?? item.artistId ?? '')
				if (!id) return null
				return {
					type,
					id,
					name: String(attrs.name ?? item.name ?? item.title ?? item.trackName ?? 'Unknown'),
					artist: String(attrs.artistName ?? item.artistName ?? item.artist ?? 'Unknown Artist'),
					album: String(attrs.albumName ?? item.albumName ?? item.album ?? ''),
					artUrl: cleanArtUrl(artwork.url ?? item.artworkUrl100 ?? item.artUrl ?? item.image ?? item.coverUrl),
				}
			}).filter((item): item is DiscoveryItem => Boolean(item))
		}

		return [...parse('songs', 'song'), ...parse('albums', 'album'), ...parse('artists', 'artist')]
	}

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

		recordRecentTrack({
			trackId: track.id,
			name: track.name,
			artist: track.artist,
			album: track.album || track.albumName,
			artUrl: track.image,
		})

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
		void loadRecommendations()
	}

	const playDiscoveryItem = async (item: DiscoveryItem, index: number) => {
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
			results = await searchCatalog(term)
			if (!results.length) {
				const artist = normalizeTracks(await spicyamll.artist({ artist: term }))
				if (artist[0]) results = await getSongsForArtist(artist[0].id, artist[0].name)
			}
			if (!results.length) results = normalizeTracks(await spicyamll.album({ album: term, l: 'en-US' }))
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
		<section class="flex flex-col gap-2">
			{#each results as item, index (item.id)}
				<article
					class="flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-surfaceContainerHighest"
				>
					<Artwork
						src={item.image || undefined}
						alt={item.name}
						class="size-16 shrink-0 rounded-xl"
						fallbackIcon="musicNote"
					/>
					<div class="min-w-0 grow">
						<div class="truncate text-title-md">{item.name}</div>
						<div class="truncate text-body-sm opacity-65">
							{item.artist || item.artists?.join(', ') || 'Unknown Artist'}
						</div>
						{#if item.album || item.albumName}
							<div class="truncate text-body-sm opacity-50">
								{item.album || item.albumName}
								{#if item.duration} · {formatDuration(item.duration)}{/if}
							</div>
						{/if}
					</div>
					<Button onclick={() => void playTrack(item, index)} kind="blank" tooltip="Play">
						<Icon type="play" />
					</Button>
				</article>
			{/each}
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
