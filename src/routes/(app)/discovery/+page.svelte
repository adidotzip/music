<script lang="ts">
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { usePlayer } from '$lib/stores/player/use-store.ts'
	import { normalizeTracks, searchCatalog, spicyamll } from '$lib/services/spicyamll.ts'

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
		} catch {
			// The search result is already enough to stream.
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
			image: track.image || undefined
				? { optimized: false, small: track.image || '', full: track.image || '' }
				: undefined,
			primaryColor: undefined,
			file: undefined,
			directory: undefined,
			fileName: undefined,
			scannedAt: Date.now(),
			url: spicyamll.streamUrl(track.id, { codec: 'aac', fallback: true, language: 'en-US' }),
			favorite: false,
			type: 'track'
		})

		player.playTrack(0, [id])
	}

	const search = async () => {
		const term = query.trim()
		if (!term) return

		loading = true
		error = null
		searched = true

		try {
			// The API docs expose /get/search for catalog discovery.
			// /get/artist is a detail endpoint and requires ?artist=...
			results = await searchCatalog(term)

			// If search returns Apple Music relationship objects, normalize the
			// actual track resources as a second pass.
			if (!results.length) {
				const searchResponse = await spicyamll.search({ q: term, l: 'en-US', limit: 25 })
				results = normalizeTracks(searchResponse)
			}

			results = results.filter((item, index, array) =>
				item.id > 0 && array.findIndex((candidate) => candidate.id === item.id) === index
			)

		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to search SpicyAMLL'
			results = []
		} finally {
			loading = false
		}
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
		<div class="text-body-lg opacity-70">Search the SpicyAMLL catalog and play it directly in Adi Music.</div>

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
		<section class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-5">
			{#each results as item, index (item.id)}
				<article class="group overflow-hidden rounded-3xl bg-surfaceContainer transition-transform duration-200 hover:-translate-y-1">
					<Artwork
						src={item.image || undefined}
						alt={item.name}
						class="w-full"
						fallbackIcon="musicNote"
					/>
					<div class="flex flex-col gap-3 p-4">
						<div class="min-w-0">
							<div class="truncate text-title-md">{item.name}</div>
							<div class="truncate text-body-sm opacity-65">{item.artist || item.artists?.join(', ') || 'Unknown Artist'}</div>
							{#if item.album || item.albumName}
								<div class="truncate text-body-sm opacity-50">{item.album || item.albumName}</div>
							{/if}
						</div>
						<Button onclick={() => void playTrack(item, index)} class="w-full">
							<Icon type="play" />
							Play
						</Button>
					</div>
				</article>
			{/each}
		</section>
	{:else}
		<section class="grid gap-4 md:grid-cols-3">
			{#each [
				['musicNote', 'Search anything', 'Find songs, artists, albums and more.'],
				['playlistMusic', 'Build your queue', 'Play a result and keep browsing without leaving the player.'],
				['musicNote', 'Stream instantly', 'Adi Music uses the AAC web stream from SpicyAMLL.']
			] as card}
				<div class="rounded-3xl bg-surfaceContainer p-6">
					<Icon type={card[0]} class="mb-5 size-8" />
					<div class="text-title-lg">{card[1]}</div>
					<div class="mt-1 text-body-md opacity-65">{card[2]}</div>
				</div>
			{/each}
		</section>
	{/if}
</main>
