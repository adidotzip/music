import { innerHeight, innerWidth } from 'svelte/reactivity/window'
import type { RouteId } from '$app/types'
import type { LayoutMode } from '$lib/components/ListDetailsLayout.svelte'

const MIN_HEIGHT_FOR_HORIZONTAL = 600
const MIN_WIDTH_FOR_SPLIT = 1200

const isRouteQueueOrHistory = (routeId: RouteId): boolean =>
	routeId === '/(app)/player/queue' ||
	routeId === '/(app)/player/history' ||
	routeId === '/(app)/player/lyrics'

const getLayoutMode = (isCompact: boolean, routeId: RouteId | null): LayoutMode => {
	if (!isCompact) {
		return 'both'
	}

	if (routeId && isRouteQueueOrHistory(routeId)) {
		return 'details'
	}

	return 'list'
}

export interface LayoutProps {
	isCompactVertical: boolean
	isCompactHorizontal: boolean
	isCompact: boolean
	layoutMode: LayoutMode
}

export const getLayoutProps = (routeId: RouteId | null): LayoutProps => {
	const width = innerWidth.current ?? 0
	const height = innerHeight.current ?? 0
	const isCompactVertical = height < MIN_HEIGHT_FOR_HORIZONTAL
	const isCompactHorizontal = width < MIN_WIDTH_FOR_SPLIT
	const isCompact = isCompactVertical || isCompactHorizontal

	return {
		isCompactVertical,
		isCompactHorizontal,
		isCompact,
		layoutMode: getLayoutMode(isCompact, routeId),
	}
}
