<script lang="ts">
	import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text.ts'
	import Button from './Button.svelte'
	import Icon from './icon/Icon.svelte'
	import PlayerFavoriteButton from './player/buttons/PlayerFavoriteButton.svelte'
	import PlayNextButton from './player/buttons/PlayNextButton.svelte'
	import PlayPrevButton from './player/buttons/PlayPrevButton.svelte'
	import PlayToggleButton from './player/buttons/PlayToggleButton.svelte'
	import MainControls from './player/MainControls.svelte'
	import PlayerArtwork from './player/PlayerArtwork.svelte'
	import Timeline from './player/Timeline.svelte'
	import VolumeSlider from './player/VolumeSlider.svelte'

	const { class: className }: { class?: ClassValue } = $props()

	const mainStore = useMainStore()
	const player = usePlayer()

	const track = $derived(player.activeTrack)
</script>

<div
	id="mini-player"
	class={[
		'pointer-events-auto mx-auto w-[min(100%,56.25rem)] max-w-[calc(100vw-1rem)] justify-between overflow-hidden rounded-2xl border border-primary/10 bg-secondaryContainer text-onSecondaryContainer contain-content view-name-[pl-card] sm:h-auto sm:rounded-3xl active-view-player:border-transparent',
		className,
	]}
>
	<div class="flex size-full min-w-0 flex-col items-center justify-between gap-[clamp(0.5rem,1.25vw,1rem)] px-[clamp(0.25rem,1.25vw,1rem)] py-[clamp(0.25rem,1vh,0.75rem)] sm:pt-2 sm:pb-4">
		<Timeline class="max-sm:hidden" />
		<div class="grid min-h-[clamp(3.5rem,7vw,4rem)] w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[clamp(0.125rem,0.75vw,0.5rem)] px-0 py-0 sm:h-auto sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
			<div class="flex min-w-0 flex-1 items-center">
				<Button
					as="a"
					href="/player"
					kind="blank"
					tooltip={m.playerOpenFullPlayer()}
					class="group flex min-w-0 flex-1 items-center overflow-hidden rounded-xl pr-1 sm:h-12 sm:max-w-70 sm:rounded-lg sm:pr-2"
				>
					<div
						class="relative size-[clamp(2.25rem,4vw,2.75rem)] shrink-0 overflow-hidden rounded-lg bg-onSecondary active-view-player:view-name-[pl-artwork]"
					>
						{#if track}
							<PlayerArtwork class="size-full" />
						{:else}
							<Icon type="musicNote" class="absolute inset-0 m-auto size-5 text-onSecondaryContainer/40" />
						{/if}

						<Icon
							type="chevronUp"
							class={[
								'absolute inset-0 m-auto shrink-0 active-view-player:view-name-[pl-chevron-up]',
								track &&
									'scale-0 rounded-full bg-tertiary text-onTertiary transition-[transform,opacity] duration-200 [.group:hover_&]:scale-100',
							]}
						/>
					</div>

					{#if track}
						<div class="ml-2.5 mr-1 grid min-w-0 flex-1 text-left sm:ml-3" lang={getItemLanguage(track.language)}>
							<div class="truncate text-body-md font-medium">
								{track.name}
							</div>
							<div class="truncate text-body-sm text-onSecondaryContainer/70">{formatArtists(track.artists)}</div>
						</div>
					{:else}
						<div class="ml-2.5 text-body-sm text-onSecondaryContainer/60 sm:ml-3">
							{m.playerQueueEmpty()}
						</div>
					{/if}
				</Button>

				<PlayerFavoriteButton class="size-[clamp(2.25rem,4vw,2.5rem)] shrink-0" />
			</div>

			<div class="ml-auto flex shrink-0 items-center gap-0 sm:hidden">
				<PlayPrevButton class="mobile-player-control" />
				<PlayToggleButton class="mobile-player-control" />
				<PlayNextButton class="mobile-player-control" />
			</div>

			<MainControls class="max-sm:hidden" />

			<div class="ml-auto flex shrink-0 items-center gap-1 pr-1 max-sm:hidden">
				{#if mainStore.volumeSliderEnabled}
					<VolumeSlider />
				{/if}
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	@reference '../../app.css';

	@media (max-width: 639px) {
		#mini-player {
			border-radius: 24px;
		}

		:global(#mini-player .aero-player) {
			--player-size: 40px;
			--player-icon: 24px;
		}

		:global(#mini-player .mobile-player-control) {
			width: clamp(32px, 9vw, 36px);
			height: clamp(32px, 9vw, 36px);
			flex: 0 0 clamp(32px, 9vw, 36px);
		}

		:global(#mini-player .mobile-player-control .aero-skip) {
			--skip-size: 22px;
		}
	}

	@media (max-width: 320px) {
		:global(#mini-player .group > div:first-child) {
			width: 32px;
			height: 32px;
			flex-basis: 32px;
		}

		:global(#mini-player .group > div:nth-child(2)) {
			margin-left: 8px;
		}

		:global(#mini-player .group) {
			padding-right: 0;
		}
	}

	::view-transition-old(pl-chevron-up) {
		display: none;
	}

	@keyframes -global-view-pl-chevron-up-fade-in {
		from {
			opacity: 0;
			transform: scale(0);
		}
	}

	::view-transition-new(pl-chevron-up) {
		animation: view-pl-chevron-up-fade-in 125ms 225ms linear backwards;
	}
</style>
