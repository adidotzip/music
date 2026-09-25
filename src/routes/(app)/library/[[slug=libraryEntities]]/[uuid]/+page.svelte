<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity'
	import Artwork from '$lib/components/Artwork.svelte'
	import Button from '$lib/components/Button.svelte'
	import Header from '$lib/components/Header.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'
	import MenuButton from '$lib/components/MenuButton.svelte'
	import TracksListContainer from '$lib/components/tracks/TracksListContainer.svelte'
	import { initPageQueries } from '$lib/db/query/page-query.svelte.ts'
	import { getAnimatedArtwork } from '$lib/helpers/animated-artwork'
	import { getArtistArtwork } from '$lib/helpers/artist-artwork.ts'
	import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte'
	import { formatArtists, formatNameOrUnknown } from '$lib/helpers/utils/text.ts'
	import type { AlbumData, TrackData } from '$lib/library/get/value.ts'
	import { getLibraryValue } from '$lib/library/get/value.ts'
	import {
		FAVORITE_PLAYLIST_ID,
		removeTrackEntryFromPlaylist,
	} from '$lib/library/playlists-actions.ts'
	import { type Album, type Playlist, UNKNOWN_ITEM } from '$lib/library/types.ts'
	import { getPlaylistMenuItems } from '$lib/menu-actions/playlists.ts'

	const { data } = $props()

	const main = useMainStore()
	const dialogs = useDialogsStore()
	const player = usePlayer()

	initPageQueries(() => data)

	const item = $derived(data.itemQuery.value)
	const tracks = $derived(data.tracksQuery.value)
	const slug = $derived(data.slug)

	const isFavoritesView = $derived(slug === 'playlists' && item.id === FAVORITE_PLAYLIST_ID)

	const getFallbackArtwork = () => {
		if (slug === 'playlists') return 'playlist'
		if (slug === 'albums') return 'album'
		return 'person'
	}

	const artworkSrc = createManagedArtwork(() => {
		if (slug !== 'playlists') return (item as Album).image
		return null
	})

	let firstPlaylistTrack = $state<TrackData | undefined>()
	const playlistArtworkSrc = createManagedArtwork(
		() => firstPlaylistTrack?.image?.full ?? firstPlaylistTrack?.image?.small,
	)

	$effect(() => {
		if (slug !== 'playlists') {
			firstPlaylistTrack = undefined
			return
		}

		const trackId = tracks.tracksIds[0]
		if (trackId === undefined) {
			firstPlaylistTrack = undefined
			return
		}

		let cancelled = false
		void Promise.resolve(getLibraryValue('tracks', trackId, true)).then((track) => {
			if (!cancelled) firstPlaylistTrack = track
		})

		return () => {
			cancelled = true
		}
	})

	let artistArtworkSrc = $state<string | undefined>()
	let animatedArtworkSrc = $state<string | undefined>()
	$effect(() => {
		if (slug === 'albums' && item) {
			const album = item as AlbumData
			const artist = (album.artists[0] as string) ?? ''
			if (artist === UNKNOWN_ITEM || album.name === UNKNOWN_ITEM) {
				animatedArtworkSrc = undefined
				return
			}
			getAnimatedArtwork(artist, album.name).then((result) => {
				animatedArtworkSrc = result?.url
			})
		} else if (slug === 'artists' && item) {
			artistArtworkSrc = undefined
			getArtistArtwork(item.name).then((url) => {
				artistArtworkSrc = url
			})
		} else {
			animatedArtworkSrc = undefined
		}
	})

	const isWideLayout = new MediaQuery('(min-width: 1154px)')
	const backdropSrc = $derived(slug === 'albums' ? artworkSrc() : playlistArtworkSrc())

	const playlistTrackMenuItems = (track: TrackData) => {
		if (isFavoritesView) return []

		return [
			{
				label: m.libraryTrackRemoveFromPlaylist(),
				action: () => {
					const entryId = tracks.playlistIdMap?.[track.id]
					invariant(entryId)
					void removeTrackEntryFromPlaylist(entryId)
				},
			},
		]
	}

	const getMenuItems = () => {
		const addToQueueMenuItem =
			tracks.tracksIds.length === 0
				? null
				: {
						label: m.playerAddToQueue(),
						action: () => {
							player.addToQueue(tracks.tracksIds)
						},
					}

		if (slug === 'playlists') {
			if (isFavoritesView) return [addToQueueMenuItem]
			return [addToQueueMenuItem, ...getPlaylistMenuItems(dialogs, item as Playlist)]
		}

		return [
			addToQueueMenuItem,
			{
				label: m.libraryAddToPlaylist(),
				action: () => {
					dialogs.openDialog('addToPlaylist', tracks.tracksIds)
				},
			},
			{
				label: m.libraryRemoveFromLibrary(),
				action: () => {
					dialogs.openDialog('removeFromLibrary', {
						type: 'single',
						id: item.id,
						name: item.name,
						storeName: slug,
					})
				},
			},
		]
	}

	const menuItems = $derived.by(() => {
		const items = getMenuItems().filter((item) => item !== null)
		return items.length > 0 ? items : null
	})

	const description = $derived(slug === 'playlists' && (item as Playlist).description)
	const artists = $derived(slug === 'albums' && formatArtists((item as AlbumData).artists))
</script>

{#if !(isWideLayout.current && main.librarySplitLayoutEnabled)}
	<Header
		title={undefined}
		class={(scrolled) =>
			scrolled
				? 'bg-surface/90 backdrop-blur-xl'
				: 'bg-transparent'
		}
	/>
{/if}

<div
	class="relative isolate flex min-h-full grow flex-col overflow-hidden"
	style={backdropSrc ? `--page-art: url("${backdropSrc}")` : undefined}
>
	{#if backdropSrc}
		<div class="pointer-events-none absolute inset-0 -z-20 scale-110 bg-cover bg-center opacity-70 blur-3xl" style="background-image: var(--page-art)"></div>
		<div class="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-surface/20 via-surface/60 to-surface"></div>
	{/if}

	<div class="@container mx-auto flex w-full max-w-(--app-max-content-width) grow flex-col px-4 pb-32">
		<section
			class="relative flex min-h-105 w-full flex-col items-center justify-end overflow-hidden pt-10 pb-5 text-center @2xl:min-h-130"
		>
			{#if slug === 'artists'}
				<Artwork
					src={artistArtworkSrc}
					animatedSrc={animatedArtworkSrc}
					fallbackIcon={getFallbackArtwork()}
					class="mb-5 size-48 rounded-full shadow-xl"
				/>
			{/if}

			<div class="relative z-10 flex w-full max-w-2xl flex-col items-center">
				<div class="mb-2 text-label-lg font-medium uppercase tracking-wide text-onSurfaceVariant">
					{slug === 'playlists'
						? m.libraryPlaylists()
						: slug === 'albums'
							? 'Album'
							: 'Artist'}
				</div>

				<h1 class="text-display-sm font-bold tracking-tight text-onSurface sm:text-display-md">
					{formatNameOrUnknown(item.name)}
				</h1>

				{#if artists}
					<div class="mt-2 text-title-lg font-medium text-onSurface">{artists}</div>
				{/if}

				{#if description}
					<div class="mt-2 max-w-xl text-body-lg text-onSurfaceVariant">{description}</div>
				{/if}

				<div class="mt-2 text-body-md text-onSurfaceVariant">
					{#if slug === 'albums' && (item as AlbumData).year !== UNKNOWN_ITEM}
						{(item as AlbumData).year} •
					{/if}
					{m.libraryTracksCount({ count: tracks.tracksIds.length })}
				</div>

				<div class="mt-6 flex items-center justify-center gap-3">
					<Button
						kind="flat"
						class="size-12 min-w-12 rounded-full bg-surface/45 p-0 backdrop-blur-xl"
						disabled={tracks.tracksIds.length === 0}
						aria-label={m.shuffle()}
						onclick={() => {
							player.playTrack(0, tracks.tracksIds, { shuffle: true })
						}}
					>
						<Icon type="shuffle" />
					</Button>

					<Button
						kind="filled"
						class="h-14 min-w-44 rounded-full px-7 text-title-md font-semibold shadow-lg"
						disabled={tracks.tracksIds.length === 0}
						onclick={() => {
							player.playTrack(0, tracks.tracksIds)
						}}
					>
						<Icon type="play" />
						{m.play()}
					</Button>

					{#if slug === 'albums'}
						<MenuButton
							ariaLabel={m.more()}
							tooltip={m.more()}
							class="size-12 min-w-12 rounded-full bg-surface/45 p-0 backdrop-blur-xl"
							menuItems={menuItems ?? undefined}
					/>
					{:else}
						<div class="flex size-12 items-center justify-center rounded-full bg-surface/45 text-onSurface backdrop-blur-xl">
							<Icon type="check" />
						</div>
					{/if}
				</div>
			</div>
		</section>

		<div class="relative z-10 overflow-hidden rounded-3xl bg-surface/35 shadow-xl backdrop-blur-xl">
			<TracksListContainer
				items={tracks.tracksIds}
				predefinedMenuItems={{
					disableViewAlbum: slug === 'albums',
					disableViewArtist: slug === 'artists',
					disableAddToFavorites: isFavoritesView,
					enableMultiRemoveFromFavorites: isFavoritesView,
				}}
				menuItems={slug === 'playlists' ? playlistTrackMenuItems : undefined}
			/>
		</div>
	</div>
</div>
