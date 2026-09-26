<script lang="ts" generics="Type extends LibraryGridItemType">
	import { getLibraryValue, type AlbumData } from '$lib/library/get/value.ts'
	import { dbGetAlbumTracksIdsByName } from '$lib/library/get/ids'
	import LibraryGridItem, {
		type LibraryGridItemType,
		type LibraryItemGridItemProps,
	} from './LibraryGridItem.svelte'

	interface Props<Type extends LibraryGridItemType> {
		type: Type
		items: readonly number[]
		item: LibraryItemGridItemProps<Type>['children']
	}

 	const { items, type, item: itemSnippet }: Props<Type> = $props()
	let visibleItems = $state<readonly number[]>(items)

	const refreshVisibleItems = async () => {
		if (type !== 'albums') {
			visibleItems = items
			return
		}

		const downloaded: number[] = []
		for (const itemId of items) {
			const album = await getLibraryValue('albums', itemId, true) as AlbumData | undefined
			if (!album) continue
			const trackIds = await dbGetAlbumTracksIdsByName(album.name)
			let hasDownloadedTrack = false
			for (const trackId of trackIds) {
				const track = await getLibraryValue('tracks', trackId, true)
				if (track?.file) {
					hasDownloadedTrack = true
					break
				}
			}
			if (hasDownloadedTrack) downloaded.push(itemId)
		}
		visibleItems = downloaded
	}

	$effect(() => {
		let cancelled = false
		const refresh = async () => {
			await refreshVisibleItems()
			if (cancelled) return
		}
		void refresh()
		window.addEventListener('adi-music-library-updated', refresh)
		return () => {
			cancelled = true
			window.removeEventListener('adi-music-library-updated', refresh)
		}
	})
</script>

{#if visibleItems.length === 0}
	<div class="m-auto flex min-h-48 items-center justify-center text-center text-onSurfaceVariant">
		{m.noItemsToDisplay()}
	</div>
{:else}
	<div
		class={[
			'library-entity-grid grid w-full content-start items-start justify-start',
			type === 'artists' && 'artist-grid',
		]}
	>
		{#each visibleItems as itemId (itemId)}
			<LibraryGridItem {itemId} {type} class="library-entity-card" style="">
				{#snippet children(itemValue)}
					{@render itemSnippet(itemValue)}
				{/snippet}
			</LibraryGridItem>
		{/each}
	</div>
{/if}

<style>
	.library-entity-grid {
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 16px;
	}

	.library-entity-grid :global(.library-entity-card) {
		width: 100%;
		max-width: 220px;
		min-width: 0;
		justify-self: start;
	}

	@media (max-width: 640px) {
		.library-entity-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}

		.library-entity-grid :global(.library-entity-card) {
			max-width: none;
		}
	}

	@media (min-width: 641px) and (max-width: 900px) {
		.library-entity-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (min-width: 901px) {
		.library-entity-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 220px));
		}
	}
</style>
