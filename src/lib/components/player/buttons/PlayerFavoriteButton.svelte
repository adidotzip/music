<script lang="ts">
	import IconButton from '$lib/components/IconButton.svelte'
	import FavoriteButton from '$lib/components/FavoriteButton.svelte'
	import { isFavoriteSong, toggleFavoriteSong } from '$lib/services/online-library.ts'

	const player = usePlayer()
	const track = $derived(player.activeTrack)
	let remoteFavorite = $state(false)

	$effect(() => {
		const id = track?.remoteId
		remoteFavorite = id ? isFavoriteSong(id) : false
	})

	const toggleRemoteFavorite = (event: MouseEvent) => {
		if (!track?.remoteId) return
		e.stopPropagation()
		const next = toggleFavoriteSong(track.remoteId)
		remoteFavorite = next
		const target = event.currentTarget
		if (target instanceof HTMLElement) {
			const icon = target.querySelector('svg')
			icon?.animate(
				{ transform: ['scale(1)', 'scale(0.6)', 'scale(1)'] },
				{ duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
			)
		}
	}
</script>

{#if track?.remoteId}
	<IconButton
		icon={remoteFavorite ? 'favorite' : 'favoriteOutline'}
		tooltip={remoteFavorite ? m.trackRemoveFromFavorites() : m.trackAddToFavorites()}
		onclick={toggleRemoteFavorite}
	/>
{:else if track}
	<FavoriteButton trackId={track.id} favorite={track.favorite} />
{/if}
