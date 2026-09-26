<script lang="ts" generics="Type extends LibraryGridItemType">
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
</script>

{#if items.length === 0}
	<div class="m-auto flex min-h-48 items-center justify-center text-center text-onSurfaceVariant">
		{m.noItemsToDisplay()}
	</div>
{:else}
	<div
		class={[
			'library-entity-grid grid w-full content-start items-start justify-start',
			type === 'artists' && 'artist-grid',
		]}
		role="list"
	>
		{#each items as itemId, index (itemId)}
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
