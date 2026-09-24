<script lang="ts">
	import { goto } from '$app/navigation'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import { addSongToLibrary, getLibrarySongs, getRecentlyPlayed, type RecentTrack } from '$lib/services/library.ts'
	import { usePlayer } from '$lib/stores/player/use-store.ts'
	import {
		normalizeTracks,
		parseDiscoveryResults,
		searchDiscovery,
		searchArtists,
		getSongsForArtist,
		spicyamll,
		type DiscoveryResource,
	} from '$lib/services/spicyamll.ts'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'

	type DiscoveryItem = DiscoveryResource
	type DiscoveryTrack = ReturnType<typeof normalizeTracks>[number]

	type Mood = {
		name: string
		icon: string
		query: string
	}

	const player = usePlayer()

	let query = $state('')
	let searched = $state(false)
	let loading = $state(false)
	let loadingRecommendations = $state(false)
	let error = $state<string | null>(null)

	let results = $state<DiscoveryItem[]>([])
	let recent = $state<RecentTrack[]>([])
	let madeForYou = $state<DiscoveryItem[]>([])
	let similarTracks = $state<DiscoveryItem[]>([])
	let similarArtists = $state<DiscoveryItem[]>([])
	let newMusic = $state<DiscoveryItem[]>([])
	let explore = $state<DiscoveryItem[]>([])
	let genreShelves = $state<{ name: string; items: DiscoveryItem[] }[]>([])
	let moodShelves = $state<{ name: string; items: DiscoveryItem[] }[]>([])

	let selectedAlbum = $state<DiscoveryItem | null>(null)
	let albumTracks = $state<DiscoveryTrack[]>([])
	let selectedArtist = $state<DiscoveryItem | null>(null)
	let artistTracks = $state<DiscoveryTrack[]>([])
	let surpriseBusy = $state(false)

	const moods: Mood[] = [
		{ name: 'Chill', icon: 'waterDrop', query: 'chill' },
		{ name: 'Energy', icon: 'bolt', query: 'energy' },
		{ name: 'Late Night', icon: 'nightlight', query: 'late night' },
		{ name: 'Focus', icon: 'target', query: 'focus' },
		{ name: 'Happy', icon: 'sentimentSatisfied', query: 'happy' },
		{ name: 'Melancholy', icon: 'sentimentDissatisfied', query: 'melancholy' },
	]

	const genreSeeds = ['Alternative', 'Electronic', 'Indie', 'Pop', 'Rock', 'R&B']

	const cleanArtUrl = (url: unknown) => {
		if (typeof url !== 'string' || !url) return 'favicon.svg'
		return url
			.replace(/{w}/g, '1000')
			.replace(/{h}/g, '1000')
			.replace(/{c}/g, 'bb')
			.replace(/{f}/g, 'jpg')
			.replace(/d+xd+bb./, '1000x1000bb.')
	}

	const dedupe = (items: DiscoveryItem[]) => {
		const seen = new Set<string>()
		return items.filter((item) => {
			const key = `${item.type}:${item.id}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}

	const shuffle = <T,>(items: T[]) => {
		const copy = [...items]
		for (let i = copy.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1))
			;[copy[i], copy[j]] = [copy[j], copy[i]]
		}
		return copy
	}

	const toItem = (track: RecentTrack): DiscoveryItem => ({
		type: 'song',
		id: String(track.trackId || track.id),
		name: track.name,
		artist: track.artist,
		album: track.album,
		artUrl: cleanArtUrl(track.artUrl),
	})

	const rankRecommendations = (items: DiscoveryItem[], history: RecentTrack[]) => {
		const liked = new Set(getLibrarySongs().map((item) => String(item.id)))
		const played = new Map<string, number>()
		const artists = new Map<string, number>()
		const genres = new Map<string, number>()

		history.forEach((track, index) => {
			played.set(String(track.trackId || track.id), history.length - index)
			const artist = track.artist.trim().toLowerCase()
			if (artist) artists.set(artist, (artists.get(artist) ?? 0) + (history.length - index))
		})

		const sorted = [...items]
			.filter((item) => !liked.has(String(item.id)))
			.map((item, index) => {
				const artistKey = item.artist.trim().toLowerCase()
				const artistScore = artists.get(artistKey) ?? 0
				const genreScore = item.genre ? (genres.get(item.genre.toLowerCase()) ?? 0) : 0
				const recentPenalty = played.has(String(item.id)) ? -40 : 0
				const recency = history.findIndex((track) => track.artist.toLowerCase() === artistKey)
				const recentScore = recency === -1 ? 10 : Math.max(0, 10 - recency)
				const popularity = Math.max(0, 10 - index)
				const novelty = item.type === 'song' ? 10 : 5

				const score =
					artistScore * 0.3 +
					genreScore * 0.2 +
					Math.min(20, artistScore) * 1.0 +
					recentScore * 0.1 +
					popularity * 0.1 +
					novelty * 0.1 +
					recentPenalty

				return { item, score }
			})
			.sort((a, b) => b.score - a.score)

		return sorted.map(({ item }) => item)
	}

	const fetchSearch = async (term: string, limit = 24) => {
		try {
			return await searchDiscovery(term, limit)
		} catch {
			return []
		}
	}

	const loadRecommendations = async () => {
		loadingRecommendations = true
		error = null

		try {
			recent = getRecentlyPlayed(100)
			const historyItems = recent.map(toItem)
			const artists = [...new Set(recent.map((item) => item.artist.trim()).filter(Boolean))].slice(0, 5)
			const favoriteIds = new Set(getLibrarySongs().map((item) => item.id))

			const artistGroups = await Promise.all(
				artists.map((artist) => fetchSearch(artist, 20)),
			)

			const personalizedPool = dedupe(artistGroups.flat())
			madeForYou = rankRecommendations(personalizedPool, recent).slice(0, 12)

			similarTracks = dedupe(
				artists.length
					? (await Promise.all(artists.slice(0, 3).map((artist) => fetchSearch(`${artist} similar songs`, 18)))).flat()
					: personalizedPool,
			)
				.filter((item) => item.type === 'song' && !favoriteIds.has(String(item.id)))
				.slice(0, 12)

			similarArtists = dedupe(
				artists.length
					? (await Promise.all(artists.slice(0, 4).map((artist) => fetchSearch(`${artist} similar artists`, 14)))).flat()
					: [],
			).filter((item) => item.type === 'artist').slice(0, 12)

			newMusic = dedupe([
				...(artists.length
					? (await Promise.all(artists.map((artist) => fetchSearch(`${artist} new release`, 12)))).flat()
					: []),
				...(await fetchSearch('new music releases', 20)),
			]).slice(0, 14)

			const explorePool = dedupe([
				...(await fetchSearch('popular music', 20)),
				...(await fetchSearch('global music', 20)),
			])
			explore = rankRecommendations(explorePool, recent).slice(0, 14)

			genreShelves = (
				await Promise.all(
					genreSeeds.map(async (name) => ({
						name,
						items: dedupe(await fetchSearch(name, 12)).slice(0, 8),
					})),
				)
			).filter((shelf) => shelf.items.length > 0)

			moodShelves = (
				await Promise.all(
					moods.map(async (mood) => ({
						name: mood.name,
						items: dedupe(await fetchSearch(mood.query, 10)).slice(0, 8),
					})),
				)
			).filter((shelf) => shelf.items.length > 0)

			if (!madeForYou.length && historyItems.length) {
				madeForYou = historyItems.slice(0, 8)
			}
		} catch (cause) {
			console.warn('[Discovery] recommendation load failed', cause)
		} finally {
			loadingRecommendations = false
		}
	}

	const remoteId = (id: string | number, index: number) =>
		-Math.max(1, Math.abs(Number(id) || index + 1))

	const playTrack = async (item: DiscoveryItem, index = 0) => {
		if (item.type !== 'song') return

		const normalized = normalizeTracks({
			id: item.id,
			name: item.name,
			artist: item.artist,
			album: item.album,
			image: item.artUrl,
		})[0]

		if (!normalized) return

		const id = remoteId(normalized.id, index)

		registerRemoteTrack({
			id,
			remoteId: Number(normalized.id),
			streaming: true,
			uuid: `spicyamll:${normalized.id}`,
			name: normalized.name,
			album: normalized.album || normalized.albumName || '~\\0unknown',
			artists: normalized.artists?.length ? normalized.artists : [normalized.artist || 'Unknown Artist'],
			year: normalized.year ? String(normalized.year) : '~\\0unknown',
			duration: normalized.duration ?? 0,
			genre: [],
			trackNo: 0,
			trackOf: 0,
			discNo: 0,
			discOf: 0,
			language: undefined,
			image: normalized.image
				? { optimized: false, small: normalized.image, full: normalized.image }
				: undefined,
			primaryColor: undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(normalized.id, {
				codec: 'atmos',
				fallback: false,
				language: 'en-US',
				storefront: 'us',
			}),
			favorite: false,
			type: 'track',
		})

		player.playTrack(0, [id])
	}

	const playItems = async (items: DiscoveryItem[]) => {
		const songs = items.filter((item) => item.type === 'song').slice(0, 25)
		if (!songs.length) return

		const ids: number[] = []
		for (const [index, song] of songs.entries()) {
			const normalized = normalizeTracks({
				id: song.id,
				name: song.name,
				artist: song.artist,
				album: song.album,
				image: song.artUrl,
			})[0]
			if (!normalized) continue

			const id = remoteId(normalized.id, index)
			registerRemoteTrack({
				id,
				remoteId: Number(normalized.id),
				streaming: true,
				uuid: `spicyamll:${normalized.id}`,
				name: normalized.name,
				album: normalized.album || normalized.albumName || '~\\0unknown',
				artists: normalized.artists?.length ? normalized.artists : [normalized.artist || 'Unknown Artist'],
				year: normalized.year ? String(normalized.year) : '~\\0unknown',
				duration: normalized.duration ?? 0,
				genre: [],
				trackNo: 0,
				trackOf: 0,
				discNo: 0,
				discOf: 0,
				language: undefined,
				image: normalized.image
					? { optimized: false, small: normalized.image, full: normalized.image }
					: undefined,
				primaryColor: undefined,
				file: undefined,
				directory: undefined,
				fileName: undefined,
				scannedAt: Date.now(),
				url: spicyamll.streamUrl(normalized.id, {
					codec: 'atmos',
					fallback: false,
					language: 'en-US',
					storefront: 'us',
				}),
				favorite: false,
				type: 'track',
			})
			ids.push(id)
		}

		if (ids.length) player.playTrack(0, ids)
	}

	const showAlbum = async (item: DiscoveryItem) => {
		selectedAlbum = item
		try {
			albumTracks = await spicyamll.albumTracks(item.id)
		} catch {
			albumTracks = []
		}
	}

	const showArtist = async (item: DiscoveryItem) => {
		selectedArtist = item
		const artistResults = await searchArtists(item.name)
		const id = artistResults[0]?.id
		if (!id) {
			artistTracks = []
			return
		}
		artistTracks = await getSongsForArtist(id, item.name)
	}

	const activate = async (item: DiscoveryItem, index = 0) => {
		if (item.type === 'song') return playTrack(item, index)
		if (item.type === 'album') return showAlbum(item)
		return showArtist(item)
	}

	const surpriseMe = async () => {
		surpriseBusy = true
		try {
			const history = getRecentlyPlayed(100)
			const played = new Set(history.map((track) => String(track.trackId || track.id)))
			const recentArtists = new Set(history.slice(0, 6).map((track) => track.artist.toLowerCase()))
			const candidates = dedupe([
				...(await fetchSearch('discover something new', 30)),
				...(await fetchSearch('hidden gems music', 30)),
				...(await fetchSearch('indie alternative electronic', 20)),
			]).filter((item) =>
				item.type !== 'song' ||
				(!played.has(String(item.id)) && !recentArtists.has(item.artist.toLowerCase())),
			)

			const ranked = rankRecommendations(shuffle(candidates), history)
			const target = ranked.find((item) => item.type === 'song') ?? ranked[0]
			if (target) await activate(target)
		} finally {
			surpriseBusy = false
		}
	}

	const addToLibrary = (item: DiscoveryItem) => {
		if (item.type !== 'song') return
		addSongToLibrary({
			id: item.id,
			name: item.name,
			artist: item.artist,
			album: item.album,
			artUrl: item.artUrl,
		})
	}

	const search = async () => {
		const term = query.trim()
		if (!term) return
		searched = true
		loading = true
		error = null
		results = []
		try {
			results = await searchDiscovery(term)
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Search failed'
		} finally {
			loading = false
		}
	}

	const sectionTitle = (title: string, subtitle?: string) => ({ title, subtitle })

	$effect(() => {
		void loadRecommendations()
	})
</script>

<Header title="Discovery" noBackButton />

<main class="discovery-shell mx-auto w-full max-w-(--app-max-content-width) px-4 pt-6 pb-32 sm:px-6 sm:pt-8">
	<section class="discovery-hero">
		<div class="discovery-hero-copy">
			<p class="text-label-lg text-onSurfaceVariant">Adi Music</p>
			<h1 class="text-headline-large font-bold tracking-tight">Discovery</h1>
			<p class="max-w-2xl text-body-lg text-onSurfaceVariant">Find something new.</p>
		</div>

		<div class="hero-actions">
			<Button kind="toned" size="md" disabled={surpriseBusy} onclick={() => void surpriseMe()}>
				<Icon type="shuffle" />
				{surpriseBusy ? 'Finding…' : '🎲 Surprise Me'}
			</Button>
			<Button as="a" href="/library/tracks" kind="flat" size="md">
				<Icon type="library" />
				Library
			</Button>
		</div>

		<form
			class="discovery-search"
			onsubmit={(event) => {
				event.preventDefault()
				void search()
			}}
		>
			<Icon type="magnify" class="shrink-0 opacity-60" />
			<input
				bind:value={query}
				aria-label="Search music"
				placeholder="Artists, songs, genres"
				class="min-w-0 flex-1 bg-transparent px-2 text-body-md outline-none placeholder:text-onSurface/50"
			/>
			<Button type="submit" kind="filled" size="sm" disabled={loading || !query.trim()}>
				Search
			</Button>
		</form>
	</section>

	{#if searched}
		<section class="search-results">
			<div class="section-heading">
				<div>
					<h2 class="text-title-lg font-bold">Search results</h2>
					<p class="text-body-sm text-onSurfaceVariant">Explore from the same discovery surface.</p>
				</div>
			</div>

			{#if loading}
				<div class="state-card">
					<div class="size-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary"></div>
					<span>Searching the catalog…</span>
				</div>
			{:else if error}
				<div class="state-card text-onErrorContainer">{error}</div>
			{:else if !results.length}
				<div class="state-card">Nothing found. Try another artist, song, or genre.</div>
			{:else}
				<div class="result-grid">
					{#each results.slice(0, 18) as item (item.type + item.id)}
						<article class="media-card">
							<button class="art-button" onclick={() => void activate(item)} aria-label={item.name}>
								<Artwork src={item.artUrl} alt={item.name} class="aspect-square w-full rounded-2xl" fallbackIcon={item.type === 'artist' ? 'person' : 'musicNote'} />
							</button>
							<div class="mt-2 truncate text-title-sm">{item.name}</div>
							<div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || item.type}</div>
							<div class="card-actions">
								{#if item.type === 'song'}
									<Button kind="blank" tooltip="Play" onclick={() => void activate(item)}><Icon type="play" /></Button>
									<Button kind="blank" tooltip="Add to library" onclick={() => addToLibrary(item)}>+</Button>
								{:else}
									<Button kind="blank" onclick={() => void activate(item)}>View</Button>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		{#if recent.length}
			{@const latest = recent[0]}
			<section class="spotlight-grid">
				<div class="spotlight-card">
					<div class="spotlight-art">
						<Artwork src={cleanArtUrl(latest.artUrl)} alt={latest.name} class="size-full rounded-3xl" fallbackIcon="musicNote" />
					</div>
					<div class="spotlight-content">
						<p class="text-label-lg text-onSurfaceVariant">Adi Discover</p>
						<h2 class="text-headline-medium font-bold">Built from what you already love.</h2>
						<p class="text-body-md text-onSurfaceVariant">A lightweight local-first mix shaped by your listening history, favorites, recency and fresh discoveries.</p>
						<div class="mt-5 flex flex-wrap gap-2">
							<Button onclick={() => void playItems(madeForYou)} disabled={!madeForYou.length}>Play Adi Discover</Button>
							<Button kind="flat" onclick={() => void surpriseMe()} disabled={surpriseBusy}>
								<Icon type="shuffle" />
								Surprise me
							</Button>
						</div>
					</div>
				</div>
				<div class="latest-card">
					<p class="text-label-lg text-onSurfaceVariant">Because you listened to</p>
					<div class="mt-3 flex items-center gap-4">
						<Artwork src={cleanArtUrl(latest.artUrl)} alt={latest.name} class="size-20 rounded-2xl" />
						<div class="min-w-0">
							<div class="truncate text-title-lg font-semibold">{latest.name}</div>
							<div class="truncate text-body-md text-onSurfaceVariant">{latest.artist}</div>
							<Button class="mt-3" size="sm" onclick={() => void playTrack(toItem(latest))}>Play</Button>
						</div>
					</div>
				</div>
			</section>
		{:else}
			<section class="empty-discovery">
				<div class="empty-copy">
					<span class="empty-icon">✦</span>
					<h2 class="text-headline-medium font-bold">Your next favorite could be here.</h2>
					<p class="text-body-lg text-onSurfaceVariant">Play a few songs and Adi Music will start shaping Discovery around your taste.</p>
				</div>
				<Button kind="toned" onclick={() => void surpriseMe()} disabled={surpriseBusy}>
					<Icon type="shuffle" />
					Start exploring
				</Button>
			</section>
		{/if}

		{#if madeForYou.length}
			<Shelf title={sectionTitle('✨ Made for You', 'Personal picks based on your listening history.')} items={madeForYou} />
		{:else if loadingRecommendations}
			<section class="state-card">Building your local recommendations…</section>
		{/if}

		{#if similarTracks.length}
			<Shelf title={sectionTitle('Because You Like', 'More tracks that connect to artists you play a lot.')} items={similarTracks} />
		{/if}

		{#if similarArtists.length}
			<Shelf title={sectionTitle('Similar Artists')} items={similarArtists} circular />
		{/if}

		{#if newMusic.length}
			<Shelf title={sectionTitle('🆕 New Music', 'Recent releases around your taste.')} items={newMusic} />
		{/if}

		{#each genreShelves as shelf}
			<Shelf title={sectionTitle(shelf.name, 'Explore a little outside your usual rotation.')} items={shelf.items} />
		{/each}

		<section class="mood-block">
			<div class="section-heading">
				<div>
					<h2 class="text-title-lg font-bold">🎭 By Mood</h2>
					<p class="text-body-sm text-onSurfaceVariant">Pick a feeling, not a genre.</p>
				</div>
			</div>
			<div class="mood-grid">
				{#each moods as mood}
					<a href="#mood-{mood.name.toLowerCase().replaceAll(' ', '-')}" class="mood-chip">
						<Icon type={mood.icon} />
						<span>{mood.name}</span>
					</a>
				{/each}
			</div>
		</section>

		{#each moodShelves as shelf}
			<section id="mood-{shelf.name.toLowerCase().replaceAll(' ', '-')}" class="mood-shelf">
				<Shelf title={sectionTitle(shelf.name)} items={shelf.items} />
			</section>
		{/each}

		{#if explore.length}
			<Shelf title={sectionTitle('🌎 Explore', 'Broader picks when you want to wander.')} items={explore} />
		{/if}
	{/if}

	{#if selectedAlbum}
		<section class="detail-panel">
			<div class="detail-header">
				<Artwork src={selectedAlbum.artUrl} alt={selectedAlbum.name} class="size-24 rounded-2xl" />
				<div class="min-w-0 flex-1">
					<div class="text-label-lg text-onSurfaceVariant">Album</div>
					<h2 class="truncate text-headline-small font-bold">{selectedAlbum.name}</h2>
					<p class="truncate text-body-md text-onSurfaceVariant">{selectedAlbum.artist}</p>
				</div>
				<Button onclick={() => void playItems(albumTracks.map((track) => ({ type: 'song', id: String(track.id), name: track.name, artist: track.artist || '', album: track.album || '', artUrl: track.image || 'favicon.svg' })))}>Play album</Button>
				<Button kind="blank" onclick={() => (selectedAlbum = null)}>Close</Button>
			</div>
			{#if albumTracks.length}
				<div class="detail-list">
					{#each albumTracks as track, index (track.id)}
						<button class="detail-row" onclick={() => void playTrack({ type: 'song', id: String(track.id), name: track.name, artist: track.artist || '', album: track.album || '', artUrl: track.image || 'favicon.svg' }, index)}>
							<Artwork src={track.image} alt={track.name} class="size-12 rounded-xl" />
							<span class="min-w-0 flex-1 text-left">
								<span class="block truncate text-title-sm">{track.name}</span>
								<span class="block truncate text-body-sm text-onSurfaceVariant">{track.artist}</span>
							</span>
							<Icon type="play" />
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{:else if selectedArtist}
		<section class="detail-panel">
			<div class="detail-header">
				<Artwork src={selectedArtist.artUrl} alt={selectedArtist.name} class="size-24 rounded-full" fallbackIcon="person" />
				<div class="min-w-0 flex-1">
					<div class="text-label-lg text-onSurfaceVariant">Artist</div>
					<h2 class="truncate text-headline-small font-bold">{selectedArtist.name}</h2>
					<p class="truncate text-body-md text-onSurfaceVariant">{selectedArtist.genre || 'Artist'}</p>
				</div>
				<Button onclick={() => void playItems(artistTracks.map((track) => ({ type: 'song', id: String(track.id), name: track.name, artist: track.artist || selectedArtist?.name || '', album: track.album || '', artUrl: track.image || 'favicon.svg' })))}>Play artist</Button>
				<Button kind="blank" onclick={() => (selectedArtist = null)}>Close</Button>
			</div>
			{#if artistTracks.length}
				<div class="detail-list">
					{#each artistTracks.slice(0, 15) as track, index (track.id)}
						<button class="detail-row" onclick={() => void playTrack({ type: 'song', id: String(track.id), name: track.name, artist: track.artist || selectedArtist?.name || '', album: track.album || '', artUrl: track.image || 'favicon.svg' }, index)}>
							<Artwork src={track.image} alt={track.name} class="size-12 rounded-xl" />
							<span class="min-w-0 flex-1 text-left">
								<span class="block truncate text-title-sm">{track.name}</span>
								<span class="block truncate text-body-sm text-onSurfaceVariant">{track.album || 'Single'}</span>
							</span>
							<Icon type="play" />
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

{#snippet Shelf(title: { title: string; subtitle?: string }, items: DiscoveryItem[], circular = false)}
	<section class="shelf">
		<div class="section-heading">
			<div>
				<h2 class="text-title-lg font-bold">{title.title}</h2>
				{#if title.subtitle}<p class="text-body-sm text-onSurfaceVariant">{title.subtitle}</p>{/if}
			</div>
		</div>
		<div class="shelf-scroll" tabindex="0" aria-label={title.title}>
			{#each items as item, index (item.type + item.id)}
				<article class="media-card shelf-card" class:circular={circular}>
					<button class="art-button" onclick={() => void activate(item, index)} aria-label={item.name}>
						<Artwork src={item.artUrl} alt={item.name} class={['aspect-square w-full', circular ? 'rounded-full' : 'rounded-2xl']} fallbackIcon={item.type === 'artist' ? 'person' : 'musicNote'} />
					</button>
					<div class="mt-2 truncate text-title-sm">{item.name}</div>
					<div class="truncate text-body-sm text-onSurfaceVariant">{item.artist || item.genre || item.type}</div>
					{#if item.type === 'song'}
						<div class="card-actions">
							<Button kind="blank" tooltip="Play" onclick={() => void activate(item, index)}><Icon type="play" /></Button>
							<Button kind="blank" tooltip="Add to library" onclick={() => addToLibrary(item)}>+</Button>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	</section>
{/snippet}

<style>
	.discovery-shell { animation: fade-in 380ms var(--ease-standard); }
	.discovery-hero { display: grid; grid-template-columns: 1fr auto; gap: 1rem 2rem; align-items: end; margin-bottom: 2.5rem; }
	.discovery-hero-copy { min-width: 0; }
	.hero-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
	.discovery-search {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: min(100%, 60rem);
		padding: 0.35rem 0.45rem 0.35rem 0.85rem;
		border: 1px solid color-mix(in srgb, var(--color-outlineVariant) 55%, transparent);
		background: var(--color-surfaceContainerHigh);
		border-radius: 1.5rem;
		box-shadow: 0 8px 24px color-mix(in srgb, black 6%, transparent);
		transition: border-color 180ms var(--ease-standard), box-shadow 180ms var(--ease-standard);
	}
	.discovery-search:focus-within { border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-outlineVariant)); box-shadow: 0 10px 30px color-mix(in srgb, black 9%, transparent); }
	.spotlight-grid { display: grid; grid-template-columns: 1.6fr 0.9fr; gap: 1rem; margin-bottom: 2rem; }
	.spotlight-card, .latest-card, .empty-discovery, .detail-panel, .state-card {
		border: 1px solid color-mix(in srgb, var(--color-outlineVariant) 45%, transparent);
		background: var(--color-surfaceContainerLow);
		border-radius: 1.75rem;
	}
	.spotlight-card { display: grid; grid-template-columns: minmax(10rem, 18rem) 1fr; gap: 1.25rem; padding: 1rem; overflow: hidden; }
	.spotlight-art { min-width: 0; aspect-ratio: 1; }
	.spotlight-content { padding: 1rem 1.25rem 1.25rem 0.5rem; align-self: center; }
	.latest-card { padding: 1.25rem; display: flex; flex-direction: column; justify-content: center; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 0.8rem; }
	.shelf { margin-top: 2.4rem; }
	.shelf-scroll { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(10.5rem, 12.5rem); gap: 0.85rem; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-width: none; padding: 0.1rem 0.1rem 0.65rem; scroll-snap-type: x proximity; }
	.shelf-scroll::-webkit-scrollbar { display: none; }
	.shelf-card { scroll-snap-align: start; }
	.media-card { min-width: 0; }
	.art-button { width: 100%; border: 0; padding: 0; background: transparent; text-align: left; cursor: pointer; transition: transform 180ms var(--ease-standard); }
	.art-button:hover { transform: translateY(-2px); }
	.card-actions { display: flex; align-items: center; gap: 0.15rem; min-height: 2.1rem; }
	.result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	.search-results { margin-top: 0.5rem; }
	.state-card { min-height: 10rem; display: grid; place-items: center; padding: 2rem; text-align: center; color: var(--color-onSurfaceVariant); }
	.mood-block { margin-top: 2.7rem; }
	.mood-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
	.mood-chip { display: flex; align-items: center; gap: 0.65rem; padding: 0.9rem 1rem; border-radius: 1.25rem; background: var(--color-surfaceContainerHigh); color: var(--color-onSurface); text-decoration: none; border: 1px solid color-mix(in srgb, var(--color-outlineVariant) 35%, transparent); transition: transform 180ms var(--ease-standard), background-color 180ms var(--ease-standard); }
	.mood-chip:hover { transform: translateY(-1px); background: var(--color-surfaceContainerHighest); }
	.mood-shelf { scroll-margin-top: 5rem; }
	.empty-discovery { padding: 2.2rem; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; margin-bottom: 1rem; }
	.empty-copy { max-width: 42rem; }
	.empty-icon { display: inline-flex; width: 2.4rem; height: 2.4rem; align-items: center; justify-content: center; border-radius: 999px; background: var(--color-secondaryContainer); margin-bottom: 0.75rem; }
	.detail-panel { margin-top: 2.5rem; padding: 1rem; }
	.detail-header { display: flex; align-items: center; gap: 1rem; }
	.detail-list { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.15rem; }
	.detail-row { display: flex; align-items: center; gap: 0.8rem; width: 100%; padding: 0.65rem 0.7rem; border: 0; border-radius: 1rem; background: transparent; color: inherit; text-align: left; cursor: pointer; }
	.detail-row:hover { background: var(--color-surfaceContainerHighest); }
	.circular :global(img), .circular :global(video) { border-radius: 9999px !important; }

	@media (max-width: 767px) {
		.discovery-hero { grid-template-columns: 1fr; align-items: start; }
		.hero-actions { justify-content: flex-start; }
		.spotlight-grid { grid-template-columns: 1fr; }
		.spotlight-card { grid-template-columns: 7.25rem 1fr; padding: 0.7rem; gap: 0.9rem; }
		.spotlight-content { padding: 0.25rem 0.45rem 0.25rem 0; }
		.result-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
		.mood-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.empty-discovery { flex-direction: column; align-items: flex-start; }
		.discovery-search :global(.m3-button-base) { min-width: 4.6rem; }
	}

	@media (min-width: 900px) {
		.result-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
		.shelf-scroll { grid-auto-columns: minmax(12rem, 14rem); }
	}

	@media (min-width: 1280px) {
		.result-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
	}

	@media (prefers-reduced-motion: reduce) {
		.discovery-shell, .art-button { animation: none !important; transition: none !important; }
		.art-button:hover { transform: none; }
	}

	@keyframes fade-in {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
