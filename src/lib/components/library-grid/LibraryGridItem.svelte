<script lang="ts" module>
	import { goto } from '$app/navigation'
	import { resolve } from '$app/paths'
	import { page } from '$app/state'
	import type { RouteId } from '$app/types'
	import { ripple } from '$lib/attachments/ripple.ts'
	import type { QueryResult } from '$lib/db/query/query.ts'
	import { getAnimatedArtwork } from '$lib/helpers/animated-artwork.ts'
	import { getArtistArtwork } from '$lib/helpers/artist-artwork.ts'
	import { createManagedArtwork } from '$lib/helpers/create-managed-artwork.svelte.ts'
	import { dbGetAlbumTracksIdsByName, dbGetArtistTracksIdsByName } from '$lib/library/get/ids'
	import { ensureTrackIsStoredLocally } from '$lib/library/local-download.ts'
	import type { AlbumData, ArtistData } from '$lib/library/get/value'
	import { createAlbumQuery, createArtistQuery } from '$lib/library/get/value-queries'
	import { UNKNOWN_ITEM } from '$lib/library/types'
	import Artwork from '../Artwork.svelte'
	import Icon from '../icon/Icon.svelte'

	export type LibraryGridItemType = 'albums' | 'artists'

	export type LibraryGridItemValue<Type extends LibraryGridItemType> = {
		albums: AlbumData
		artists: ArtistData
	}[Type]

	export interface LibraryItemGridItemProps<Type extends LibraryGridItemType> {
		itemId: number
		type: Type
		class: ClassValue
		style: string
		children: Snippet<[LibraryGridItemValue<Type>]>
	}
</script>

<script lang="ts" generics="Type extends LibraryGridItemType">
	const {
		type,
		itemId,
		class: className,
		children,
		...props
	}: LibraryItemGridItemProps<Type> = $props()

	const menu = useMenu()
	const dialogs = useDialogsStore()
	const player = usePlayer()
	let downloadingAlbum = $state(false)

	type Value = LibraryGridItemValue<Type>

	const query =
		// prettier-ignore
		(
			// svelte-ignore state_referenced_locally only initialized once
			type === 'albums' ? createAlbumQuery(() => itemId) : createArtistQuery(() => itemId)
		) as QueryResult<Value>
	const { value: item } = $derived(query)

	let artistArtworkSrc = $state<string | undefined>()
	let fallbackArtworkSrc = $state<Blob | string | undefined>()
	const artworkSrc = createManagedArtwork(() => {
		if (type === 'albums') {
			return item ? (item as AlbumData).image ?? fallbackArtworkSrc : fallbackArtworkSrc
		}

		return fallbackArtworkSrc
	})

	let animatedArtworkSrc = $state<string | undefined>()
	$effect(() => {
		let cancelled = false
		artistArtworkSrc = undefined
		fallbackArtworkSrc = undefined

		const loadFallbackArtwork = async () => {
			if (!item) return

			const name = item.name
			const trackIds = await dbGetAlbumOrArtistTrackIdsByName(name)
			for (const trackId of trackIds.slice(0, 3)) {
				try {
					const track = await getLibraryValue('tracks', trackId, true)
					const image = track?.image?.full
					if (image && !cancelled) {
						fallbackArtworkSrc = image
						return
					}
				} catch {
					// Try the next track artwork.
				}
			}
		}

		if (type === 'albums' && item) {
			const album = item as AlbumData
			const artist = (album.artists[0] as string) ?? ''
			if (artist !== UNKNOWN_ITEM && album.name !== UNKNOWN_ITEM) {
				getAnimatedArtwork(artist, album.name)
					.then((result) => {
						if (!cancelled) animatedArtworkSrc = result?.url
					})
					.catch(() => {
						if (!cancelled) animatedArtworkSrc = undefined
					})
			}

			if (!(album.image instanceof Blob)) {
				void loadFallbackArtwork()
			}
		} else if (type === 'artists' && item) {
			const artist = item as ArtistData
			getArtistArtwork(artist.name)
				.then((url) => {
					if (!cancelled && url) artistArtworkSrc = url
				})
				.catch(() => undefined)
			void loadFallbackArtwork()
		} else {
			animatedArtworkSrc = undefined
		}

		return () => {
			cancelled = true
		}
	})

	const linkProps = $derived.by(() => {
		const item = query.value
		if (!item) {
			return null
		}

		const detailsViewId: RouteId = '/(app)/library/[[slug=libraryEntities]]/[uuid]'
		const shouldReplace = page.route.id === detailsViewId

		const resolvedHref = resolve('/(app)/library/[[slug=libraryEntities]]/[uuid]', {
			slug: type,
			uuid: item.uuid,
		})

		return {
			href: resolvedHref,
			shouldReplace,
		}
	})

	const dbGetAlbumOrArtistTrackIdsByName = (name: string) => {
		if (type === 'albums') {
			return dbGetAlbumTracksIdsByName(name)
		}

		return dbGetArtistTracksIdsByName(name)
	}

	const downloadAlbum = async (event: MouseEvent) => {
		event.preventDefault()
		event.stopPropagation()

		if (type !== 'albums' || !item || downloadingAlbum) return

		downloadingAlbum = true
		try {
			const trackIds = await dbGetAlbumTracksIdsByName(item.name)
			for (const trackId of trackIds) {
				await ensureTrackIsStoredLocally(trackId)
			}
		} catch (error) {
			snackbar.unexpectedError(error)
		} finally {
			downloadingAlbum = false
		}
	}

	const menuItems = () => {
		if (!(item && linkProps)) {
			return []
		}

		return [
			{
				label: m.libraryViewDetails(),
				action: () => {
					goto(linkProps.href, { replaceState: linkProps.shouldReplace })
				},
			},
			{
				label: m.playerAddToQueue(),
				action: async () => {
					try {
						const tracksIds = await dbGetAlbumOrArtistTrackIdsByName(item.name)

						player.addToQueue(tracksIds)
					} catch (error) {
						snackbar.unexpectedError(error)
					}
				},
			},
			{
				label: m.libraryAddToPlaylist(),
				action: async () => {
					try {
						const tracksIds = await dbGetAlbumOrArtistTrackIdsByName(item.name)

						dialogs.openDialog('addToPlaylist', tracksIds)
					} catch (error) {
						snackbar.unexpectedError(error)
					}
				},
			},
			{
				label: m.libraryRemoveFromLibrary(),
				action: () => {
					dialogs.openDialog('removeFromLibrary', {
						type: 'single',
						id: item.id,
						name: item.name,
						storeName: type,
					})
				},
			},
		]
	}
</script>

<a
	{@attach ripple()}
	{...props}
	role="listitem"
	class={[className, 'interactable flex flex-col rounded-lg bg-surfaceContainerHigh']}
	href={linkProps?.href}
	data-sveltekit-replacestate={linkProps?.shouldReplace}
	oncontextmenu={(e) => {
		e.preventDefault()
		menu.showFromEvent(e, menuItems(), {
			anchor: false,
			position: { top: e.y, left: e.x },
		})
	}}
>
	<div class="relative">
		<Artwork
			src={type === 'artists' ? artistArtworkSrc : artworkSrc()}
			animatedSrc={animatedArtworkSrc}
			fallbackIcon={type === 'albums' ? 'album' : 'person'}
			class="w-full rounded-[inherit]"
		/>
		{#if type === 'albums'}
			<button
				type="button"
				class="interactable absolute right-2 bottom-2 z-2 flex size-10 items-center justify-center rounded-full bg-surfaceContainerHigh/90 text-onSurface backdrop-blur-sm"
				aria-label="Download album for offline playback"
				title="Download album for offline playback"
				disabled={downloadingAlbum}
				onclick={downloadAlbum}
			>
				<Icon type="download" class={downloadingAlbum ? 'animate-pulse' : undefined} />
			</button>
		{/if}
	</div>

	<div
		class="flex h-18 w-full flex-col justify-center overflow-hidden px-2 text-center text-onSurfaceVariant"
	>
		{#if query.loading}
			<div class="mb-2 h-2 rounded-xs bg-onSurface/10"></div>
			<div class="h-1 w-1/8 rounded-xs bg-onSurface/20"></div>
		{:else if query.error}
			{m.errorUnexpected()}
		{:else if item}
			{@render children(item)}
		{/if}
	</div>
</a>
