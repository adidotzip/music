<script lang="ts">
	import { canPlayHLS } from '$lib/helpers/utils/ua.ts'
	import type { IconType } from './icon/Icon.svelte'
	import Icon from './icon/Icon.svelte'

	interface Props {
		src: string | undefined
		animatedSrc?: string | undefined
		class?: ClassValue
		alt?: string
		fallbackIcon?: IconType | false
		noFallbackBg?: boolean
		noAspectSquare?: boolean
		onVideoLoad?: () => void
		onVideoError?: () => void
		children?: Snippet
	}

	const {
		src,
		animatedSrc,
		fallbackIcon = 'musicNote',
		noFallbackBg,
		noAspectSquare,
		onVideoLoad,
		onVideoError,
		class: className,
		alt,
		children,
	}: Props = $props()

	let error = $state(false)
	let animatedError = $state(false)
	let videoLoaded = $state(false)

	$effect(() => {
		void src
		void animatedSrc

		untrack(() => {
			error = false
			animatedError = false
			videoLoaded = false
		})
	})

	const shouldShowAnimated = $derived.by(() => {
		if (!animatedSrc || animatedError) {
			return false
		}

		if (animatedSrc.endsWith('.m3u8')) {
			return canPlayHLS()
		}

		return true
	})
</script>

<div
	class={[
		'relative flex overflow-hidden ring-1 ring-surfaceContainerHigh contain-strict',
		!noAspectSquare && 'aspect-square',
		!noFallbackBg && 'bg-surfaceContainerHighest',
		className,
	]}
>
	{#if src && !error}
		<!-- biome-ignore lint/a11y/useAltText: false positive, alt exists -->
		<img
			{src}
			{alt}
			loading="eager"
			class="size-full object-cover"
			draggable="false"
			onerror={() => {
				error = true
			}}
			onload={() => {
				error = false
			}}
		/>
	{/if}

	{#if shouldShowAnimated}
		<video
			src={animatedSrc}
			autoplay
			loop
			muted
			playsinline
			class={[
				'absolute inset-0 size-full object-cover transition-opacity duration-1000',
				!videoLoaded && 'opacity-0',
			]}
			onerror={() => {
				animatedError = true
				onVideoError?.()
			}}
			onloadeddata={() => {
				videoLoaded = true
				onVideoLoad?.()
			}}
		></video>
	{/if}

	{#if (!src || error) && !videoLoaded && fallbackIcon !== false}
		<Icon type={fallbackIcon} class="m-auto size-2/3" />
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
