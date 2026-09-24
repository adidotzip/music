<script lang="ts">
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { usePlayer } from '$lib/stores/player/use-store.ts'
	import {
		getSongsForArtist,
		normalizeTracks,
		searchCatalog,
		spicyamll,
	} from '$lib/services/spicyamll.ts'

	const player = usePlayer()

	let query = $state('')
	let loading = $state(false)
	let error = $state<string | null>(null)
	let results = $state<ReturnType<typeof normalizeTracks>>([])
	let searched = $state(false)

	const remoteId = (id: number, index: number) => -Math.max(1, Math.abs(id || index + 1))

	const playTrack = async (item: ReturnType<typeof normalizeTracks>[number], index: number) => {
		let track = item

		try {
			const detail = await spicyamll.song(item.id)
			const normalized = normalizeTracks(detail)
			if (normalized[0]) track = { ...item, ...normalized[0] }
		} catch {}

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
			image: track.image
				? { optimized: false, small: track.image, full: track.image }
				: undefined,
			primaryColor: undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(track.id, {
				codec: 'atmos',
				fallback: false,
				language: 'en-US',
			}),
			favorite: false,
			type: 'track',
		})

		player.playTrack(0, [id])
	}

	const dedupe = (tracks: ReturnType<typeof normalizeTracks>) =>
		tracks.filter(
			(item, index, array) =>
				item.id > 0 && array.findIndex((candidate) => candidate.id === item.id) === index,
		)

	const search = async () => {
		const term = query.trim()
		if (!term) return

		loading = true
		error = null
		searched = true
		results = []

		try {
			// Primary discovery search.
			results = dedupe(await searchCatalog(term))

			// If the catalog search does not return tracks, resolve the query
			// as an artist using the documented artist detail endpoint, then
			// load that artist's songs.
			if (!results.length) {
				const artist = dedupe(normalizeTracks(await spicyamll.artist({ artist: term })))
				if (artist[0]) {
					results = dedupe(await getSongsForArtist(artist[0].id, artist[0].name))
				}
			}

			// Finally try the album detail endpoint if the query is an album.
			if (!results.length) {
				results = dedupe(normalizeTracks(await spicyamll.album({ album: term, l: 'en-US' })))
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to search SpicyAMLL'
			results = []
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
</main>
