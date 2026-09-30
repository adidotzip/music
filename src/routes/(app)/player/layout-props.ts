import { innerHeight, innerWidth } from 'svelte/reactivity/window'
import type { RouteId } from '$app/types'
import type { LayoutMode } from '$lib/components/ListDetailsLayout.svelte'

const MIN_HEIGHT_FOR_HORIZONTAL = 600
const MIN_WIDTH_FOR_SPLIT = 1200

const isRouteQueueOrHistory = (routeId: RouteId): boolean =>
\trouteId === '/(app)/player/queue' ||
\trouteId === '/(app)/player/history' ||
\trouteId === '/(app)/player/lyrics'

const getLayoutMode = (isCompact: boolean, routeId: RouteId | null): LayoutMode => {
\tif (!isCompact) {
\t\treturn 'both'
\t}

\tif (routeId && isRouteQueueOrHistory(routeId)) {
\t\treturn 'details'
\t}

\treturn 'list'
}

export interface LayoutProps {
\tisCompactVertical: boolean
\tisCompactHorizontal: boolean
\tisCompact: boolean
\tlayoutMode: LayoutMode
}

export const getLayoutProps = (routeId: RouteId | null): LayoutProps => {
\tconst width = innerWidth.current ?? 0
\tconst height = innerHeight.current ?? 0
\tconst isCompactVertical = height < MIN_HEIGHT_FOR_HORIZONTAL
\tconst isCompactHorizontal = width < MIN_WIDTH_FOR_SPLIT
\tconst isCompact = isCompactVertical || isCompactHorizontal

\treturn {
\t\tisCompactVertical,
\t\tisCompactHorizontal,
\t\tisCompact,
\t\tlayoutMode: getLayoutMode(isCompact, routeId),
\t}
}
