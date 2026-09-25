<script lang="ts">
	import { page } from '$app/state'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import Spinner from '$lib/components/Spinner.svelte'
	import { generateStableId } from '$lib/services/jiosaavn.ts'
	import { getLyricsflowArtistProfile } from '$lib/services/lyricsflow.ts'
	import { registerRemoteTrack } from '$lib/library/get/value.ts'
	import { spicyamll } from '$lib/services/spicyamll.ts'
	import { onMount } from 'svelte'

	const player = usePlayer()

	let loading = $state(true)
	let error = $state<string | null>(null)
	let artistId = $state('')
	let artistNameHint = $state('')
	let artist = $state('')
	let artistArt = $state<string | undefined>()
	let songs = $state<any[]>([])
	let albums = $state<any[]>([])
	let songIds = $state<number[]>([])

	const registerSongs = () => {
		songIds = songs.map((song) => {
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
		})
	}

	const load = async () => {
		loading = true
		error = null
		try {
			const profile = await getLyricsflowArtistProfile(artistId, artistNameHint)
			artist = profile.name
			artistArt = profile.artUrl
			songs = profile.songs
			albums = profile.albums
			registerSongs()
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unable to load artist profile.'
		} finally {
			loading = false
		}
	}

	const playSong = (index: number) => {
		if (!songIds.length) return
		player.playTrack(index, songIds)
	}

	const playTopSong = (index: number) => {
		const topIds = songIds.slice(0, 10)
		if (!topIds.length) return
		player.playTrack(index, topIds)
	}

	let latestAlbum = $derived(albums[0] ?? null)
	let latestSong = $derived(songs[0] ?? null)
	let latestArtwork = $derived(latestAlbum?.artUrl || latestSong?.artUrl || artistArt)
	let latestName = $derived(latestAlbum?.name || latestSong?.album || 'Latest Release')
	let latestArtist = $derived(latestAlbum?.artist || artist)

	onMount(() => {
		artistId = decodeURIComponent(page.params.name)
		artistNameHint = page.url.searchParams.get('name')?.trim() || ''
		void load()
	})
</script>

<Header title={artist || 'Artist'} />

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:pl-20">
	{#if loading}
		<div class="my-auto flex min-h-80 flex-col items-center justify-center gap-3 text-onSurfaceVariant">
			<Spinner class="size-10" />
			<div class="text-body-md">Loading artist profile...</div>
		</div>
	{:else if error}
		<div class="my-auto flex flex-col items-center justify-center gap-3 text-center">
			<div class="text-title-lg">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-10 pb-8">
			<section class="flex items-center gap-4 border-b border-outline/10 pb-6">
				<Artwork
					src={artistArt}
					fallbackIcon="person"
					class="size-20 shrink-0 rounded-full sm:size-24"
				/>
				<div class="min-w-0">
					<div class="text-label-lg text-onSurfaceVariant">Artist</div>
					<h1 class="truncate text-display-sm font-bold text-onSurface">{artist}</h1>
				</div>
			</section>
			<section class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
				<div class="flex flex-col gap-4">
					<h1 class="text-title-lg font-bold">Latest Release</h1>
					<div class="flex flex-col gap-4">
						<Artwork
							src={latestArtwork}
							fallbackIcon="album"
							class="aspect-square w-full rounded-2xl"
						/>
						<div class="flex items-center gap-4">
							<div class="min-w-0 flex-1">
								<div class="text-body-sm text-onSurfaceVariant">{latestArtist}</div>
								<h2 class="truncate text-headline-sm font-bold">{latestName}</h2>
							</div>
							<Button
								kind="filled"
								disabled={!songIds.length}
								onclick={() => playSong(0)}
							>
								Play
							</Button>
						</div>
					</div>
				</div>

				<div class="flex min-w-0 flex-col gap-4">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg font-bold">Top Songs</h2>
						<span class="text-body-sm text-onSurfaceVariant">{songs.length} songs</span>
					</div>

					{#if songs.length}
						<div class="grid grid-cols-1 gap-2 xl:grid-cols-2">
							{#each songs.slice(0, 10) as song, index (song.id)}
								<button
									type="button"
									class="interactable flex min-w-0 items-center gap-3 rounded-2xl bg-surfaceContainerHigh p-3 text-left"
									onclick={() => playTopSong(index)}
								>
									<Artwork
										src={song.artUrl}
										fallbackIcon="musicNote"
										class="size-14 shrink-0 rounded-xl"
									/>
									<div class="min-w-0 flex-1">
										<div class="truncate text-body-lg font-bold">{song.name}</div>
										<div class="truncate text-body-md text-onSurfaceVariant">
											{song.album || artist}{song.year ? ` • ${song.year}` : ''}
										</div>
									</div>
									<span class="shrink-0 px-1 text-onSurfaceVariant/70">•••</span>
								</button>
							{/each}
						</div>
					{:else}
						<div class="rounded-2xl bg-surfaceContainerHigh p-6 text-body-md text-onSurfaceVariant">
							No songs found for this artist.
						</div>
					{/if}
				</div>
			</section>

			{#if songs.length}
				<section class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg font-bold">All Songs</h2>
						<Button kind="flat" onclick={() => playSong(0)}>Play All</Button>
					</div>
					<TracksListContainer items={songIds} />
				</section>
			{/if}

			{#if albums.length}
				<section class="flex flex-col gap-5">
					<div class="flex items-end justify-between gap-4">
						<div>
							<h2 class="text-headline-sm font-bold">Albums</h2>
							<p class="mt-1 text-body-sm text-onSurfaceVariant">{albums.length} releases</p>
						</div>
					</div>

					<div class="grid min-w-0 grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{#each albums as album (album.id)}
							<a
								href={`/album/${encodeURIComponent(album.id)}?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist || artist)}&art=${encodeURIComponent(album.artUrl)}`}
								class="interactable group flex-col min-w-0 rounded-2xl bg-surfaceContainerHigh p-2"
							>
								<div class="relative aspect-square w-full overflow-hidden rounded-xl">
									<Artwork
										src={album.artUrl}
										fallbackIcon="album"
										class="size-full rounded-xl transition-transform duration-300 group-hover:scale-[1.02]"
									/>
								</div>
								<div class="min-w-0 px-1 pb-1 pt-3">
									<div class="truncate text-body-md font-medium">{album.name}</div>
									<div class="mt-0.5 truncate text-body-sm text-onSurfaceVariant">
										{album.artist || artist}
									</div>
								</div>
							</a>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</main>
