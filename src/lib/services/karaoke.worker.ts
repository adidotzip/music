class BiquadFilter {
	b0 = 0; b1 = 0; b2 = 0;
	a1 = 0; a2 = 0;

	x1 = 0; x2 = 0;
	y1 = 0; y2 = 0;

	process(sample: number): number {
		const out = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
		this.x2 = this.x1;
		this.x1 = sample;
		this.y2 = this.y1;
		this.y1 = out;
		return out;
	}
}

function createLowpass(freq: number, q: number, sampleRate: number): BiquadFilter {
	const filter = new BiquadFilter();
	const w0 = (2 * Math.PI * freq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const cosw0 = Math.cos(w0);

	const b0 = (1 - cosw0) / 2;
	const b1 = 1 - cosw0;
	const b2 = (1 - cosw0) / 2;
	const a0 = 1 + alpha;

	filter.b0 = b0 / a0;
	filter.b1 = b1 / a0;
	filter.b2 = b2 / a0;
	filter.a1 = (-2 * cosw0) / a0;
	filter.a2 = (1 - alpha) / a0;

	return filter;
}

function createHighpass(freq: number, q: number, sampleRate: number): BiquadFilter {
	const filter = new BiquadFilter();
	const w0 = (2 * Math.PI * freq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const cosw0 = Math.cos(w0);

	const b0 = (1 + cosw0) / 2;
	const b1 = -(1 + cosw0);
	const b2 = (1 + cosw0) / 2;
	const a0 = 1 + alpha;

	filter.b0 = b0 / a0;
	filter.b1 = b1 / a0;
	filter.b2 = b2 / a0;
	filter.a1 = (-2 * cosw0) / a0;
	filter.a2 = (1 - alpha) / a0;

	return filter;
}

function createBandpass(freq: number, q: number, sampleRate: number): BiquadFilter {
	const filter = new BiquadFilter();
	const w0 = (2 * Math.PI * freq) / sampleRate;
	const alpha = Math.sin(w0) / (2 * q);
	const cosw0 = Math.cos(w0);

	const b0 = Math.sin(w0) / 2;
	const b1 = 0;
	const b2 = -Math.sin(w0) / 2;
	const a0 = 1 + alpha;

	filter.b0 = b0 / a0;
	filter.b1 = b1 / a0;
	filter.b2 = b2 / a0;
	filter.a1 = (-2 * cosw0) / a0;
	filter.a2 = (1 - alpha) / a0;

	return filter;
}

self.addEventListener('message', (event) => {
	try {
		const { left, right, sampleRate } = event.data;

		if (!left || !right || !sampleRate) {
			throw new Error('Invalid input channels or sample rate');
		}

		const len = left.length;
		const outLeft = new Float32Array(len);
		const outRight = new Float32Array(len);
		const vocalLeft = new Float32Array(len);
		const vocalRight = new Float32Array(len);

		// Determine if audio is identical in both channels (mono/centered)
		let isMono = true;
		// Check a few samples to see if they are identical
		const checkCount = Math.min(1000, len);
		for (let i = 0; i < checkCount; i++) {
			if (Math.abs(left[i] - right[i]) > 1e-4) {
				isMono = false;
				break;
			}
		}

		if (isMono) {
			// For mono files, center cancellation results in silence.
			// Instead, we use bandpass/bandstop filtering (notch) in the vocal range.
			// Vocal range: 250Hz - 3500Hz
			const bp1 = createBandpass(1000, 0.5, sampleRate);
			const bp2 = createBandpass(1000, 0.5, sampleRate);

			for (let i = 0; i < len; i++) {
				const sample = left[i];
				// Extract vocal mid-range
				const v = bp2.process(bp1.process(sample));

				vocalLeft[i] = v;
				vocalRight[i] = v;

				// Instrumental: subtract vocal range from original
				const inst = sample - v * 0.75;
				outLeft[i] = inst;
				outRight[i] = inst;
			}
		} else {
			// Stereo exact-reconstruction sub-band crossover
			// Crossover frequencies: Low 150Hz, High 6000Hz
			// Low-pass filters for L and R (2nd order Butterworth-like)
			const lpL1 = createLowpass(150, 0.707, sampleRate);
			const lpL2 = createLowpass(150, 0.707, sampleRate);
			const lpR1 = createLowpass(150, 0.707, sampleRate);
			const lpR2 = createLowpass(150, 0.707, sampleRate);

			// High-pass filters for L and R
			const hpL1 = createHighpass(6000, 0.707, sampleRate);
			const hpL2 = createHighpass(6000, 0.707, sampleRate);
			const hpR1 = createHighpass(6000, 0.707, sampleRate);
			const hpR2 = createHighpass(6000, 0.707, sampleRate);

			for (let i = 0; i < len; i++) {
				const l = left[i];
				const r = right[i];

				// Low band
				const l_low = lpL2.process(lpL1.process(l));
				const r_low = lpR2.process(lpR1.process(r));

				// High band
				const l_high = hpL2.process(hpL1.process(l));
				const r_high = hpR2.process(hpR1.process(r));

				// Mid band (original minus low and high bands)
				const l_mid = l - l_low - l_high;
				const r_mid = r - r_low - r_high;

				// Vocal removal in mid band (subtractive OOPS)
				const mid_diff = l_mid - r_mid;

				// Instrumental synthesis
				outLeft[i] = l_low + mid_diff * 0.707 + l_high;
				outRight[i] = r_low - mid_diff * 0.707 + r_high;

				// Vocal synthesis (original minus instrumental)
				vocalLeft[i] = l - (outLeft[i] ?? 0);
				vocalRight[i] = r - (outRight[i] ?? 0);
			}
		}

		self.postMessage({
			status: 'success',
			left: outLeft,
			right: outRight,
			leftVocal: vocalLeft,
			rightVocal: vocalRight,
			sampleRate
		}, [outLeft.buffer, outRight.buffer, vocalLeft.buffer, vocalRight.buffer]);

	} catch (e) {
		self.postMessage({
			status: 'error',
			error: e instanceof Error ? e.message : String(e)
		});
	}
});
