<script lang="ts">
	import FavoriteButton from '$lib/components/FavoriteButton.svelte'

	interface Props {
		class?: ClassValue
	}

	const { class: className }: Props = $props()

	const player = usePlayer()
	const track = $derived(player.activeTrack)
</script>

{#if track}
	<FavoriteButton trackId={track.id} favorite={track.favorite} class={className} />
{/if}
