declare module '*?as=metadata' {
	const metadata: {
		src: string
		width: number
		height: number
	}

	export default metadata
}

declare module 'https://nurislamaibekuly.github.io/aeroui/*' {
	export const initPlayerButton: (container: HTMLElement) => void
	export const setPlayerIcon: (container: HTMLElement, icon: string) => void
	export const initSkipLabel: (container: HTMLElement) => void
	export const playSkip: (container: HTMLElement) => void
	const defaultExport: any
	export default defaultExport
}
