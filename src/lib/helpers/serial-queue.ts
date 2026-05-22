/** @public */
export class SerialQueue {
	#chain = Promise.resolve()

	enqueue<T>(promiseFn: () => Promise<T>): Promise<T> {
		const result = this.#chain.then(promiseFn)
		this.#chain = result.then(
			() => {},
			() => {},
		)

		return result
	}

	drain(): Promise<void> {
		return this.#chain
	}
}
