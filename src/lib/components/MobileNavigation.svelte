<script lang="ts">
	import { page } from '$app/state'
	import Button from '$lib/components/Button.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'

	interface Props {
		online?: boolean
		bindHeight?: (height: number) => void
	}

	const { online = true, bindHeight }: Props = $props()
	let isOnline = $state(true)
	let navEl = $state<HTMLElement>()
	const isPlayerPage = $derived(page.url.pathname.startsWith('/player'))

	$effect(() => {
		isOnline = online
		const updateOnline = () => {
			if (typeof navigator !== 'undefined') isOnline = navigator.onLine
		}
		window.addEventListener('online', updateOnline)
		window.addEventListener('offline', updateOnline)
		return () => {
			window.removeEventListener('online', updateOnline)
			window.removeEventListener('offline', updateOnline)
		}
	})

	$effect(() => {
		if (!navEl) return
		const element = navEl
		const observer = new ResizeObserver(([entry]) => {
			if (entry) bindHeight?.(entry.borderBoxSize[0]?.blockSize ?? element.offsetHeight ?? 0)
		})
		observer.observe(element)
		return () => observer.disconnect()
	})

	type NavItem = {
		href: string
		title: string
		icon: any
	}

	const items: NavItem[] = [
		{ href: '/library', title: 'Library', icon: 'home' },
		{ href: '/library/tracks', title: m.tracks(), icon: 'musicNote' },
		{ href: '/library/albums', title: m.albums(), icon: 'album' },
		{ href: '/library/artists', title: m.artists(), icon: 'person' },
		{ href: '/library/playlists', title: m.playlists(), icon: 'playlist' },
	]
	const isActive = (href: string) =>
		href === '/library'
			? page.url.pathname === '/library'
			: page.url.pathname === href || page.url.pathname.startsWith(href + '/')
</script>

<nav
	bind:this={navEl}
	aria-label="Primary navigation"
	class={['mobile-nav pointer-events-auto fixed inset-x-0 bottom-0 z-30 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:hidden', isPlayerPage && 'hidden!']}
>
	<div class="mx-auto flex w-full max-w-md justify-center">
		<div class="dock flex w-full items-center justify-around gap-1 overflow-hidden rounded-[28px] border border-outline/10 bg-surfaceContainer/95 p-1.5 shadow-[0_10px_35px_rgb(0_0_0/14%)] backdrop-blur-2xl">
			{#each items as item}
				<Button as="a" href={item.href} kind="blank" tooltip={item.title} aria-current={isActive(item.href) ? 'page' : undefined}
					class={['dock-item flex size-11 shrink-0 items-center justify-center rounded-[20px] transition-[background-color] duration-200',
						isActive(item.href) ? 'bg-secondaryContainer text-onSecondaryContainer font-bold' : 'text-onSurfaceVariant hover:bg-surfaceContainerHigh']}>
					<Icon type={item.icon} class="size-5 shrink-0" />
				</Button>
			{/each}

			{#if isOnline}
				<Button as="a" href="/discovery" kind="blank" tooltip="Discovery" aria-current={page.url.pathname === '/discovery' ? 'page' : undefined}
					class={['dock-item flex size-11 shrink-0 items-center justify-center rounded-[20px] transition-[background-color] duration-200',
						page.url.pathname === '/discovery' ? 'bg-secondaryContainer text-onSecondaryContainer font-bold' : 'text-onSurfaceVariant hover:bg-surfaceContainerHigh']}>
					<Icon type="compass" class="size-5 shrink-0" />
				</Button>
			{/if}

		</div>
	</div>
</nav>
