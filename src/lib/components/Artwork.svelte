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

	const isHlsJsSupported = $derived.by(() => {
		if (typeof window === 'undefined') {
			return false
		}
		return 'MediaSource' in window
	})

	const shouldShowAnimated = $derived.by(() => {
		if (!animatedSrc || animatedError) {
			return false
		}

		if (animatedSrc.endsWith('.m3u8')) {
			return canPlayHLS() || isHlsJsSupported
		}

		return true
	})

	let videoElement = $state<HTMLVideoElement>()

	$effect(() => {
		const srcVal = animatedSrc
		const el = videoElement
		let hlsInstance: any = null

		if (srcVal && el && shouldShowAnimated && srcVal.endsWith('.m3u8') && !canPlayHLS()) {
			import('hls.js').then(({ default: Hls }) => {
				if (!Hls.isSupported()) {
					animatedError = true
					onVideoError?.()
					return
				}

				hlsInstance = new Hls({
					capLevelToPlayerSize: true,
					maxBufferLength: 5,
				})
				hlsInstance.loadSource(srcVal)
				hlsInstance.attachMedia(el)
				hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
					if (data.fatal) {
						animatedError = true
						onVideoError?.()
					}
				})
			}).catch((err) => {
				console.error('Failed to load hls.js', err)
				animatedError = true
				onVideoError?.()
			})
		}

		return () => {
			if (hlsInstance) {
				hlsInstance.destroy()
			}
		}
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
		{#key animatedSrc}
			<video
				bind:this={videoElement}
				src={canPlayHLS() ? animatedSrc : undefined}
				autoplay
				loop
				muted
				playsinline
				class={[
					'absolute inset-0 size-full object-cover transition-opacity duration-1000',
					!videoLoaded && 'opacity-0',
				]}
				onerror={() => {
					if (canPlayHLS() || !animatedSrc?.endsWith('.m3u8')) {
						animatedError = true
						onVideoError?.()
					}
				}}
				onloadeddata={() => {
					videoLoaded = true
					onVideoLoad?.()
				}}
			></video>
		{/key}
	{/if}

	{#if (!src || error) && !videoLoaded && fallbackIcon !== false}
		<Icon type={fallbackIcon} class="m-auto size-2/3" />
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
