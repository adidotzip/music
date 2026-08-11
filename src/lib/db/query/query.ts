import {
	QueryImpl,
	type QueryKey,
	type QueryBaseOptions as QueryOptions,
	type QueryResult,
	QueryResultBox,
} from './base-query.svelte.js'

export type { QueryKey, QueryResult } from './base-query.svelte.js'
export type { QueryOptions }

export const createQuery = <const K extends QueryKey, Result>(options: QueryOptions<K, Result>) => {
	const query = new QueryImpl<K, Result>(options)
	query.setupListeners()

	void query.load()

	return new QueryResultBox(query.state) as QueryResult<Result>
}
