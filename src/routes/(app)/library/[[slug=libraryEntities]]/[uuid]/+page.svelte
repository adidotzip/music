<script lang="ts">
	import { resolve } from '$app/paths'
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
	import { type AlbumData, getLibraryValue, type TrackData } from '$lib/library/get/value.ts'
import { dbGetAlbumTracksIdsByName, getLibraryItemIds } from '$lib/library/get/ids.ts'
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
	let artistAlbums = $state<Array<{
		id: string
		name: string
		artist: string
		image: string
		year: string
		localUuid: string
	}>>([])
	let localArtistTrackIds = $state<number[]>([])

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
							const image = track?.image?.small ?? track?.image?.full
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
			artistAlbums = []
			localArtistTrackIds = []

			const loadLocalArtist = async () => {
				try {
					const localAlbumIds = await getLibraryItemIds('albums', { sort: 'name' })
					const normalized = (value: string) => value.trim().toLowerCase()
					const localAlbums: AlbumData[] = []

					for (const albumId of localAlbumIds) {
						const album = await getLibraryValue('albums', albumId, true)
						if (!album) continue
						const albumArtists = album.artists.map(String)
						if (!albumArtists.some((artist) => normalized(artist) === normalized(item.name))) continue

						const trackIds = await dbGetAlbumTracksIdsByName(album.name)
						if (!trackIds.length) continue

						let fullyLocal = true
						for (const trackId of trackIds) {
							const track = await getLibraryValue('tracks', trackId, true)
							if (!track?.file) {
								fullyLocal = false
								break
							}
						}
						if (fullyLocal) localAlbums.push(album)
					}

					artistAlbums = localAlbums.slice(0, 12).map((album) => ({
						id: String(album.id),
						name: album.name,
						artist: String(album.artists[0] ?? item.name),
						image: album.image?.full ?? album.image?.small ?? '',
						year: album.year === UNKNOWN_ITEM ? '' : String(album.year),
						localUuid: album.uuid,
					}))

					const downloadedIds: number[] = []
					for (const trackId of tracks.tracksIds) {
						const track = await getLibraryValue('tracks', trackId, true)
						if (track?.file) downloadedIds.push(trackId)
					}
					localArtistTrackIds = downloadedIds
					artistArtworkSrc = (item as any).image?.full ?? (item as any).image?.small ?? undefined
				} catch {
					// Artist pages remain usable from the local library even if optional metadata is unavailable.
				}
			}

			void loadLocalArtist()
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

			return [
				addToQueueMenuItem,				...getPlaylistMenuItems(dialogs, item as Playlist),
			]
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

{#if isWideLayout.current && main.librarySplitLayoutEnabled}
	<Header title={data.singularTitle()} mode="sticky" />
{:else}
	<Header title={data.singularTitle()} />
{/if}

