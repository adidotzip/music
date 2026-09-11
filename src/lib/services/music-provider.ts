import type { AlbumData, ArtistData, PlaylistData, TrackData } from '$lib/library/get/value-queries.ts'

export interface MusicProviderSearchResult {
	tracks: TrackData[]
	albums: AlbumData[]
	artists: ArtistData[]
	playlists: PlaylistData[]
}

export interface MusicProvider {
	id: string
	name: string
	search(query: string): Promise<MusicProviderSearchResult>
	playTrack(track: TrackData): Promise<boolean>
	pause(): Promise<void>
	resume(): Promise<void>
	seek(positionSeconds: number): Promise<void>
	setVolume(volumePercentage: number): Promise<void>
}
