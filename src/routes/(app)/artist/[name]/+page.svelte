<script lang="ts">
	import { page } from '$app/state'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import { generateStableId } from '$lib/services/jiosaavn.ts'
	import { getLyricsflowArtistProfile } from '$lib/services/lyricsflow.ts'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { spicyamll } from '$lib/services/spicyamll.ts'
	import { onMount } from 'svelte'

	const player = usePlayer()

	let loading = $state(true)
	let error = $state<string | null>(null)
	let artist = $state('')
	let artistArt = $state<string | undefined>()
	let songs = $state<any[]>([])
	let albums = $state<any[]>([])
	let songIds = $derived(songs.map((song) => {
		const id = generateStableId(`spicyamll:${song.id}`)
		registerRemoteTrack({
			id,
			remoteId: Number(song.id) || 0,
			streaming: true,
			uuid: `spicyamll:${song.id}`,
			name: song.name,
			album: song.album || 'Unknown Album',
			artists: song.artist ? [song.artist] : [artist],
			year: 'Unknown',
			duration: song.duration || 0,
			genre: [],
			trackNo: 0,
			trackOf: 0,
			discNo: 0,
			discOf: 0,
			language: undefined,
			image: song.artUrl ? { optimized: false, small: song.artUrl, full: song.artUrl } : undefined,
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
	}))

	const load = async () => {
		loading = true
		error = null
		try {
			const profile = await getLyricsflowArtistProfile(artist)
			artist = profile.name
			artistArt = profile.artUrl
			songs = profile.songs
			albums = profile.albums
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load artist profile.'
		} finally {
			loading = false
		}
	}

	onMount(() => {
		artist = decodeURIComponent(page.params.name)
		void load()
	})
</script>

<Header title={artist || 'Artist'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	{#if loading}
		<div class="my-auto flex min-h-80 items-center justify-center">
			<div class="text-title-md opacity-60">Loading artist profile...</div>
		</div>
	{:else if error}
		<div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
			<div class="text-title-lg">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<section class="relative mb-8 flex flex-col items-center gap-6 overflow-hidden rounded-3xl bg-surfaceContainerHigh p-6 sm:flex-row sm:items-end sm:p-8">
			<Artwork src={artistArt} fallbackIcon="person" class="size-40 shrink-0 rounded-full sm:size-52" />
			<div class="min-w-0 flex-1 text-center sm:text-left">
				<div class="mb-2 text-label-lg text-onSurfaceVariant">Artist</div>
				<h1 class="truncate text-display-sm font-bold">{artist}</h1>
				<div class="mt-2 text-body-md text-onSurfaceVariant">{songs.length} songs • {albums.length} albums</div>
			</div>
			<Button
			kind="filled"
			disabled={songIds.length === 0}
			onclick={() => player.playTrack(0, songIds)}
		>
			Play
		</Button>
		</section>

		{#if songs.length}
			<section class="mb-8 flex flex-col gap-3">
				<h2 class="text-title-lg font-bold">Popular Songs</h2>
				<TracksListContainer items={songIds.slice(0, 20)} />
			</section>
		{/if}

		{#if albums.length}
			<section class="flex flex-col gap-3">
				<h2 class="text-title-lg font-bold">Albums</h2>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
					{#each albums as album (album.id)}
						<div class="overflow-hidden rounded-xl bg-surfaceContainerHigh">
							<Artwork src={album.artUrl} fallbackIcon="album" class="aspect-square w-full" />
							<div class="truncate p-3 text-body-md">{album.name}</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</main>
{/if}
