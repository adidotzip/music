<script lang="ts">
	import { formatArtists, getItemLanguage } from '$lib/helpers/utils/text.ts'
	import Button from './Button.svelte'
	import Icon from './icon/Icon.svelte'
	import PlayerFavoriteButton from './player/buttons/PlayerFavoriteButton.svelte'
	import PlayNextButton from './player/buttons/PlayNextButton.svelte'
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
		'pointer-events-auto mx-auto w-full max-w-225 justify-between overflow-hidden rounded-2xl border border-primary/10 bg-secondaryContainer text-onSecondaryContainer contain-content view-name-[pl-card] sm:h-auto sm:rounded-3xl active-view-player:border-transparent',
		className,
	]}
>
	<div class="flex size-full flex-col items-center justify-between gap-4 sm:px-4 sm:pt-2 sm:pb-4">
		<Timeline class="max-sm:hidden" />
		<div class="mini-player-row flex min-h-16 w-full min-w-0 items-center gap-2 px-2 py-1 sm:grid sm:h-auto sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-0 sm:py-0">
			<div class="mini-player-main flex min-w-0 flex-1 items-center overflow-hidden">
				<Button
					as="a"
					href="/player"
					kind="blank"
					tooltip={m.playerOpenFullPlayer()}
					class="group mini-player-track flex min-w-0 flex-1 items-center justify-start overflow-hidden rounded-xl pr-1 sm:h-12 sm:max-w-70 sm:rounded-lg sm:pr-2"
				>
					<div
						class="relative size-11 shrink-0 overflow-hidden rounded-lg bg-onSecondary active-view-player:view-name-[pl-artwork]"
					>
						{#if track}
							<PlayerArtwork class="size-full" />
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
						<div class="mini-player-meta ml-3 mr-1 grid min-w-0 flex-1 overflow-hidden sm:ml-3" lang={getItemLanguage(track.language)}>
							<div class="mini-player-title truncate text-body-md">
								{track.name}
							</div>
							<div class="mini-player-artist truncate text-body-sm">{formatArtists(track.artists)}</div>
						</div>
					{/if}
				</Button>

				<div class="mini-player-favorite shrink-0">
					<PlayerFavoriteButton class="max-sm:size-10" />
				</div>
			</div>

			<div class="mini-player-controls flex shrink-0 items-center gap-1 pl-1 sm:hidden">
				<PlayToggleButton />

				<PlayNextButton class="max-xss:hidden" />
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

    #mini-player > div {
      gap: 0;
    }

    #mini-player .mini-player-row {
      min-width: 0;
      width: 100%;
      align-items: center;
      gap: 8px;
    }

    #mini-player .mini-player-main {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    #mini-player .mini-player-track {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    #mini-player .mini-player-meta {
      min-width: 0;
      flex: 1 1 auto;
      width: 0;
      overflow: hidden;
    }

    #mini-player .mini-player-title,
    #mini-player .mini-player-artist {
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #mini-player .mini-player-favorite,
    #mini-player .mini-player-controls {
      flex: 0 0 auto;
    }

    #mini-player .mini-player-favorite .aero-icon-button,
    #mini-player .mini-player-controls .aero-player {
      flex: 0 0 auto;
    }

    #mini-player .aero-player {
      --player-size: 44px;
      --player-icon: 26px;
    }

    #mini-player .timeline-container {
      display: none;
    }
  }

  @media (min-width: 640px) {
    #mini-player .mini-player-row {
      position: relative;
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
    }

    #mini-player .mini-player-main {
      min-width: 0;
      width: 40%;
      max-width: 40%;
      flex: 0 1 40%;
      justify-content: flex-start;
      overflow: hidden;
    }

    #mini-player .mini-player-track {
      min-width: 0;
      max-width: 280px;
      flex: 0 1 280px;
      justify-content: flex-start;
    }

    #mini-player .mini-player-meta {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    #mini-player .mini-player-controls {
      position: absolute;
      left: 50%;
      display: flex;
      width: max-content;
      flex: 0 0 auto;
      align-items: center;
      transform: translateX(-50%);
    }

    #mini-player .mini-player-row > :last-child {
      position: relative;
      z-index: 1;
      margin-left: auto;
      min-width: 0;
      flex: 0 0 auto;
    }
  }

	.controls {
		grid-template-columns: 1fr max-content 1fr;
	}

	@media (min-width: 640px) {
		#mini-player .flex.h-min.w-full.grow {
			min-height: 52px;
		}

		#mini-player .flex.h-min.w-full.grow > :first-child {
			width: 100%;
			max-width: 24rem;
		}

		#mini-player .flex.h-min.w-full.grow > :nth-child(2) {
			justify-self: center;
		}

		#mini-player .flex.h-min.w-full.grow > :last-child {
			min-width: 0;
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
