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
	import { fade, fly, scale } from 'svelte/transition'
	import { cubicOut } from 'svelte/easing'

	const menu = useMenu()
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

<main class="mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32 sm:px-6 md:px-8">
	{#if loading}
		<div
			in:fade={{ duration: 250 }}
			out:fade={{ duration: 150 }}
			class="my-auto flex min-h-80 flex-col items-center justify-center gap-3 text-onSurfaceVariant"
		>
			<Spinner class="size-10 animate-spin" />
			<div class="animate-pulse text-body-md">Loading artist profile...</div>
		</div>
	{:else if error}
		<div
			in:scale={{ duration: 300, start: 0.95, easing: cubicOut }}
			out:fade={{ duration: 150 }}
			class="my-auto flex flex-col items-center justify-center gap-3 text-center"
		>
			<div class="text-title-lg">{error}</div>
			<Button onclick={() => void load()}>Retry</Button>
		</div>
	{:else}
		<div
			in:fade={{ duration: 300 }}
			class="flex flex-col gap-10 pb-8"
		>
			<!-- Hero Header -->
			<section
				in:fly={{ y: 20, duration: 400, easing: cubicOut }}
				class="flex items-center gap-4 border-b border-outline/10 pb-6 sm:gap-6"
			>
				<Artwork
					src={artistArt}
					fallbackIcon="person"
					class="size-20 shrink-0 rounded-full shadow-lg transition-transform duration-500 hover:scale-105 sm:size-28"
				/>
				<div class="min-w-0 flex-1">
					<div class="text-label-lg font-medium text-onSurfaceVariant">Artist</div>
					<h1 class="truncate text-headline-lg font-bold text-onSurface sm:text-display-md">{artist}</h1>
				</div>
			</section>

			<section class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
				<!-- Latest Release -->
				<div
					in:fly={{ y: 20, duration: 400, delay: 100, easing: cubicOut }}
					class="flex flex-col gap-4"
				>
					<h2 class="text-title-lg font-bold">Latest Release</h2>
					<div class="group/card flex flex-col gap-4 rounded-3xl border border-outline/10 bg-surfaceContainerHigh/50 p-4 transition-all duration-300 hover:bg-surfaceContainerHigh hover:shadow-xl">
						<div class="overflow-hidden rounded-2xl">
							<Artwork
								src={latestArtwork}
								fallbackIcon="album"
								class="aspect-square w-full rounded-2xl transition-transform duration-500 ease-out group-hover/card:scale-105"
							/>
						</div>
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="truncate text-body-sm text-onSurfaceVariant">{latestArtist}</div>
								<h3 class="truncate text-headline-sm font-bold">{latestName}</h3>
							</div>
							<Button
								kind="filled"
								disabled={!songIds.length}
								onclick={() => playSong(0)}
								class="shrink-0 transition-transform active:scale-95"
							>
								Play
							</Button>
						</div>
					</div>
				</div>

				<!-- Top Songs -->
				<div
					in:fly={{ y: 20, duration: 400, delay: 150, easing: cubicOut }}
					class="flex min-w-0 flex-col gap-4"
				>
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg font-bold">Top Songs</h2>
						<span class="text-body-sm text-onSurfaceVariant">{songs.length} songs</span>
					</div>

					{#if songs.length}
						<div class="grid grid-cols-1 gap-2 xl:grid-cols-2">
							{#each songs.slice(0, 10) as song, index (song.id)}
								<div
									role="button"
									tabindex="0"
									style="--delay: {index * 30}ms"
									class="stagger-animate interactable group flex min-w-0 items-center gap-3 rounded-2xl bg-surfaceContainerHigh p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-surfaceContainerHighest hover:shadow-md active:translate-y-0"
									onclick={() => playTopSong(index)}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault()
											playTopSong(index)
										}
									}}
								>
									<Artwork
										src={song.artUrl}
										fallbackIcon="musicNote"
										class="size-14 shrink-0 rounded-xl transition-transform duration-300 group-hover:scale-105"
									/>
									<div class="min-w-0 flex-1">
										<div class="truncate text-body-lg font-bold transition-colors group-hover:text-primary">{song.name}</div>
										<div class="truncate text-body-md text-onSurfaceVariant">
											{song.album || artist}{song.year ? ` • ${song.year}` : ''}
										</div>
									</div>
									<button
										type="button"
										class="interactable flex size-10 shrink-0 items-center justify-center rounded-full text-onSurfaceVariant transition-colors hover:bg-outline/10 hover:text-onSurface"
										aria-label="More options"
										onclick={(event) => {
											event.stopPropagation()
											const trackId = songIds[index]
											if (trackId === undefined) return
											menu.showFromEvent(
												event,
												[
													{ label: 'Play', action: () => playTopSong(index) },
													{ label: 'Play next', action: () => player.playNextTrack(trackId) },
													{ label: 'Add to queue', action: () => player.addToQueue(trackId) },
												],
												{ anchor: true, preferredAlignment: { horizontal: 'right', vertical: 'bottom' } },
											)
										}}
									>
										<span class="text-base font-bold leading-none">•••</span>
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<div class="rounded-2xl bg-surfaceContainerHigh p-6 text-body-md text-onSurfaceVariant">
							No songs found for this artist.
						</div>
					{/if}
				</div>
			</section>

			<!-- All Songs -->
			{#if songs.length}
				<section
					in:fly={{ y: 20, duration: 400, delay: 200, easing: cubicOut }}
					class="flex flex-col gap-3"
				>
					<div class="flex items-center justify-between">
						<h2 class="text-title-lg font-bold">All Songs</h2>
						<Button kind="flat" onclick={() => playSong(0)}>Play All</Button>
					</div>
					<TracksListContainer items={songIds} />
				</section>
			{/if}

			<!-- Albums Grid -->
			{#if albums.length}
				<section
					in:fly={{ y: 20, duration: 400, delay: 250, easing: cubicOut }}
					class="flex flex-col gap-5"
				>
					<div class="flex items-end justify-between gap-4">
						<div>
							<h2 class="text-headline-sm font-bold">Albums</h2>
							<p class="mt-1 text-body-sm text-onSurfaceVariant">{albums.length} releases</p>
						</div>
					</div>

					<div class="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{#each albums as album, index (album.id)}
							<a
								href={`/album/${encodeURIComponent(album.id)}?name=${encodeURIComponent(album.name)}&artist=${encodeURIComponent(album.artist || artist)}&art=${encodeURIComponent(album.artUrl)}`}
								style="--delay: {index * 40}ms"
								class="stagger-animate interactable group flex min-w-0 flex-col rounded-2xl bg-surfaceContainerHigh p-3 transition-all duration-300 hover:-translate-y-1 hover:bg-surfaceContainerHighest hover:shadow-lg active:translate-y-0"
							>
								<div class="relative aspect-square w-full overflow-hidden rounded-xl">
									<Artwork
										src={album.artUrl}
										fallbackIcon="album"
										class="size-full rounded-xl transition-transform duration-500 ease-out group-hover:scale-105"
									/>
								</div>
								<div class="min-w-0 px-1 pb-1 pt-3">
									<div class="truncate text-body-md font-medium transition-colors group-hover:text-primary">{album.name}</div>
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

<style>
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.stagger-animate {
		animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: var(--delay, 0ms);
	}

	@media (prefers-reduced-motion: reduce) {
		.stagger-animate {
			animation: none !important;
		}
	}
</style>
