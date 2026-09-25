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

	onMount(() => {
		albumId = decodeURIComponent(page.params.id)
		void load()
	})
</script>

<Header title={albumName || 'Album'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	{#if loading}
		<div class="my-auto flex min-h-80 items-center justify-center">
			<div class="text-title-md opacity-60">Loading album...</div>
		</div>
	{:else if error}
		<div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
			<div class="text-title-lg">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-8">
			<section class="flex flex-col items-center gap-6 rounded-2xl bg-surfaceContainerHigh p-5 sm:flex-row">
				<Artwork src={artwork} fallbackIcon="album" class="size-52 shrink-0 rounded-2xl" />
				<div class="min-w-0">
					<h1 class="text-headline-lg font-bold">{albumName}</h1>
					{#if artistName}<div class="mt-1 text-body-lg text-onSurfaceVariant">{artistName}</div>{/if}
					<div class="mt-2 text-body-sm text-onSurfaceVariant">{songIds.length} {songIds.length === 1 ? 'song' : 'songs'}</div>
					<Button kind="filled" class="mt-4" disabled={!songIds.length} onclick={() => player.playTrack(0, songIds)}>Play</Button>
				</div>
			</section>
			<TracksListContainer items={songIds} />
		</div>
	{/if}
</main>
