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
	import { getArtistProfile, getAlbumsForArtist } from '$lib/services/spicyamll.ts'
	import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte'
	import { formatArtists, formatNameOrUnknown } from '$lib/helpers/utils/text.ts'
	import { type AlbumData, getLibraryValue, registerRemoteTrack, type TrackData } from '$lib/library/get/value.ts'
	import { ensureTrackIsStoredLocally } from '$lib/library/local-download.ts'
	import { getLibraryArtists } from '$lib/services/library.ts'
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
		if (slug === 'playlists') {
			return 'playlist'
		}

		if (slug === 'albums') {
			return 'album'
		}

		return 'person'
	}

	let albumFallbackArtworkSrc = $state<Blob | string | undefined>()

	const artworkSrc = createManagedArtwork(() => {
		if (slug !== 'playlists') {
			return (item as Album).image ?? albumFallbackArtworkSrc
		}

		return null
	})

	let artistArtworkSrc = $state<string | undefined>()
	let animatedArtworkSrc = $state<string | undefined>()
	let artistProfile = $state<{
		id: string
		name: string
		image: string
		genre: string
		bio: string
	} | null>(null)
	let artistAlbums = $state<Array<{
		id: string
		name: string
		artist: string
		image: string
		year: string
	}>>([])
	let localArtistTrackIds = $state<number[]>([])

	const remoteIdToNumber = (id: string | number) => {
		const value = String(id)
		let hash = 0
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) | 0
		}
		return -(Math.abs(hash || 1))
	}

	$effect(() => {
		let cancelled = false
		if (slug === 'albums' && item) {
			const album = item as AlbumData
			const artist = (album.artists[0] as string) ?? ''
			albumFallbackArtworkSrc = undefined

			if (artist !== UNKNOWN_ITEM && album.name !== UNKNOWN_ITEM) {
				getAnimatedArtwork(artist, album.name).then((result) => {
					if (!cancelled) animatedArtworkSrc = result?.url
				})
			}

			if (!album.image && tracks.tracksIds.length > 0) {
				const loadAlbumFallback = async () => {
					for (const trackId of tracks.tracksIds.slice(0, 3)) {
						try {
							const track = await getLibraryValue('tracks', trackId, true)
							const image = track?.image?.full
							if (image && !cancelled) {
								albumFallbackArtworkSrc = image
								return
							}
						} catch {
							// Try next track
						}
					}
				}
				void loadAlbumFallback()
			}
		} else if (slug === 'artists' && item) {
			artistArtworkSrc = undefined
			artistProfile = null
			artistAlbums = []
			localArtistTrackIds = []

			const loadArtistProfile = async () => {
				try {
					// Artist services resolve the canonical Apple Music/iTunes artistId from the name.
					const localArtistId = getLibraryArtists().find(
						(artist) => artist.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
					)?.id
					const [profile, albums, localAlbumIds] = await Promise.all([
						getArtistProfile(localArtistId, item.name),
						getAlbumsForArtist(localArtistId, item.name),
						getLibraryItemIds('albums', { sort: 'name' }),
					])

					if (cancelled) return
					artistProfile = profile

					const localAlbums: AlbumData[] = []
					for (const albumId of localAlbumIds) {
						const album = await getLibraryValue('albums', albumId, true)
						if (!album) continue
						const trackIds = await dbGetAlbumTracksIdsByName(album.name)
						let downloaded = false
						for (const trackId of trackIds) {
							const track = await getLibraryValue('tracks', trackId, true)
							if (track?.file) {
								downloaded = true
								break
							}
						}
						if (downloaded) localAlbums.push(album)
					}

					const normalized = (value: string) => value.trim().toLowerCase()
					artistAlbums = albums
						.map((album) => {
							const localAlbum = localAlbums.find((candidate) => normalized(candidate.name) === normalized(album.name))
							if (!localAlbum) return null
							return { ...album, localUuid: localAlbum.uuid }
						})
						.filter((album): album is NonNullable<typeof album> => album !== null)
						.slice(0, 12)

					const downloadedIds: number[] = []
					for (const trackId of tracks.tracksIds) {
						const track = await getLibraryValue('tracks', trackId, true)
						if (track?.file) downloadedIds.push(trackId)
					}
					localArtistTrackIds = downloadedIds
					artistArtworkSrc = profile.image || (await getArtistArtwork(profile.name)) || undefined
				} catch {
					if (!cancelled) {
						artistArtworkSrc = (await getArtistArtwork(item.name)) || undefined
					}
				}
			}

			void loadArtistProfile()
		} else {
			animatedArtworkSrc = undefined
		}

		return () => {
			cancelled = true
		}
	})

	const isWideLayout = new MediaQuery('(min-width: 1154px)')

	const playlistTrackMenuItems = (track: TrackData) => {
		if (isFavoritesView) {
			return []
		}

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

	const downloadAlbum = async () => {
		if (slug !== 'albums' || !tracks.tracksIds.length) return

		try {
			for (const trackId of tracks.tracksIds) {
				await ensureTrackIsStoredLocally(trackId)
			}
		} catch (error) {
			snackbar.unexpectedError(error)
		}
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
			if (isFavoritesView) {
				return [addToQueueMenuItem]
			}

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
	<Header title={data.singularTitle()} />
{/if}

<div class="@container flex grow flex-col px-4 pb-4">
	<section
		class="relative flex w-full flex-col items-center justify-center gap-6 overflow-clip py-4 @2xl:min-h-60 @2xl:flex-row"
	>
		{#if slug !== 'playlists'}
			<Artwork
				src={slug === 'artists' ? artistArtworkSrc : artworkSrc()}
				animatedSrc={animatedArtworkSrc}
				fallbackIcon={getFallbackArtwork()}
				class="h-49 shrink-0 rounded-2xl @2xl:h-full"
			/>
		{/if}

		<div
			class="relative z-0 flex size-full flex-col overflow-clip rounded-2xl bg-surfaceContainerHigh"
		>
			<div class="flex grow flex-col p-4">
				<div class="flex items-center gap-2">
					<Icon
						type={slug === 'albums' ? 'album' : slug === 'artists' ? 'person' : 'playlist'}
						class="size-10 text-onSurface/54"
					/>

					<h1 class="text-headline-md">{formatNameOrUnknown(slug === 'artists' ? (artistProfile?.name || item.name) : item.name)}</h1>
				</div>

				{#if slug === 'artists' && artistProfile?.genre}
					<div class="text-body-lg text-onSurfaceVariant">{artistProfile.genre}</div>
				{/if}

				{#if slug === 'artists' && artistProfile?.bio}
					<div class="max-w-3xl text-body-md text-onSurfaceVariant">{artistProfile.bio}</div>
				{:else if description}
					<div class="text-body-lg">{description}</div>
				{/if}

				{#if artists}
					<div class="grid w-full overflow-hidden text-body-lg">
						<div class="truncate">
							{artists}
						</div>
					</div>
				{/if}

				<div class="mt-1 text-onSurfaceVariant">
					{#if slug === 'albums' && (item as AlbumData).year !== UNKNOWN_ITEM}
						{(item as AlbumData).year} •
					{/if}

					{#if slug === 'artists' && artistAlbums.length > 0}
						{artistAlbums.length} albums •
					{/if}

					{m.libraryTracksCount({
						count: slug === 'artists' ? localArtistTrackIds.length : tracks.tracksIds.length,
					})}
				</div>
			</div>

			<div class="mt-auto flex items-center gap-2 py-4 pr-2 pl-4">
				{#if slug === 'albums'}
					<Button
						kind="flat"
						class="my-1"
						disabled={tracks.tracksIds.length === 0}
						onclick={() => void downloadAlbum()}
					>
						<Icon type="download" />
					</Button>
				{/if}

				<Button
					kind="filled"
					class="my-1"
					disabled={tracks.tracksIds.length === 0}
					onclick={() => {
						player.playTrack(0, tracks.tracksIds)
					}}
				>
					{m.play()}
				</Button>

				<Button
					kind="flat"
					class="my-1 mr-auto"
					disabled={tracks.tracksIds.length === 0}
					onclick={() => {
						player.playTrack(0, tracks.tracksIds, {
							shuffle: true,
						})
					}}
				>
					{m.shuffle()}
					<Icon type="shuffle" />
				</Button>

				{#if menuItems}
					<MenuButton tooltip={m.more()} menuItems={() => menuItems} />
				{/if}
			</div>
		</div>
	</section>

	{#if slug === 'artists'}
		<section class="mt-8">
			<div class="mb-4">
				<h2 class="text-headline-sm">Top Songs</h2>
				<div class="text-body-sm text-onSurfaceVariant">
					{localArtistTrackIds.length > 0 ? localArtistTrackIds.length + ' downloaded songs' : 'No downloaded songs'}
				</div>
			</div>
			<TracksListContainer
				items={localArtistTrackIds}
				predefinedMenuItems={{
					disableViewAlbum: false,
					disableViewArtist: true,
				}}
			/>
		</section>

		{#if artistAlbums.length > 0}
			<section class="mt-8">
				<h2 class="mb-4 text-headline-sm">Albums</h2>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
					{#each artistAlbums as album (album.id)}
						<a
							href={resolve('/(app)/library/[[slug=libraryEntities]]/[uuid]', {
								slug: 'albums',
								uuid: album.localUuid,
							})}
							class="min-w-0 overflow-hidden rounded-2xl bg-surfaceContainerHigh transition-transform hover:-translate-y-0.5 hover:bg-surfaceContainerHighest"
						>
							<div class="aspect-square overflow-hidden rounded-2xl bg-surfaceContainerHighest">
								<Artwork src={album.image} alt={album.name} fallbackIcon="album" class="size-full rounded-2xl" />
							</div>
							<div class="min-w-0 p-3">
								<div class="truncate text-body-md font-medium">{album.name}</div>
								{#if album.year}<div class="text-body-sm text-onSurfaceVariant">{album.year}</div>{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
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
	{/if}
</div>
