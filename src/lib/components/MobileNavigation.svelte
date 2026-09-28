<script lang="ts">
	import { browser } from '$app/environment'
	import { page } from '$app/state'
	import Button from '$lib/components/Button.svelte'
	import Icon from '$lib/components/icon/Icon.svelte'

	const { online = true }: { online?: boolean } = $props()
	let isOnline = $state(online)

	$effect(() => {
		isOnline = online
	})

	type NavItem = {
		href: string
		title: string
		icon: any
	}

	const items: NavItem[] = [
		{ href: '/library', title: 'Library', icon: 'home' },
		{ href: '/library/tracks', title: 'Tracks', icon: 'musicNote' },
		{ href: '/library/albums', title: 'Albums', icon: 'album' },
		{ href: '/library/artists', title: 'Artists', icon: 'person' },
	]

	const isActive = (href: string) => {
		if (href === '/library') return page.url.pathname === '/library'
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/')
	}

	const syncOnline = () => {
		isOnline = navigator.onLine
	}

	if (browser) {
		window.addEventListener('online', syncOnline)
		window.addEventListener('offline', syncOnline)
	}
</script>

<nav
	aria-label="Primary navigation"
	class="mobile-nav pointer-events-auto fixed inset-x-0 bottom-0 z-30 hidden border-t border-outline/10 bg-surfaceContainer/95 px-1 pt-1 pb-[max(4px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/8%)] backdrop-blur-xl sm:hidden"
>
	<div class="mx-auto grid h-14 w-full max-w-lg items-stretch {isOnline ? 'grid-cols-5' : 'grid-cols-4'}">
		{#each items as item}
			<Button
				as="a"
				href={item.href}
				kind="blank"
				aria-current={isActive(item.href) ? 'page' : undefined}
				class="h-full min-w-0 flex-col justify-center gap-0.5 rounded-xl px-1"
			>
				<div
					class={[
						'flex size-8 items-center justify-center rounded-full transition-colors',
						isActive(item.href) && 'bg-secondaryContainer text-onSecondaryContainer',
					]}
				>
					<Icon type={item.icon} class="size-5" />
				</div>
				<span class="max-w-full truncate text-[11px] leading-4">{item.title}</span>
			</Button>
		{/each}

		{#if isOnline}
			<Button
				as="a"
				href="/discovery"
				kind="blank"
				aria-current={page.url.pathname === '/discovery' ? 'page' : undefined}
				class="h-full min-w-0 flex-col justify-center gap-0.5 rounded-xl px-1"
			>
				<div
					class={[
						'flex size-8 items-center justify-center rounded-full transition-colors',
						page.url.pathname === '/discovery' && 'bg-secondaryContainer text-onSecondaryContainer',
					]}
				>
					<Icon type="compass" class="size-5" />
				</div>
				<span class="max-w-full truncate text-[11px] leading-4">Discovery</span>
			</Button>
		{/if}
	</div>
</nav>
