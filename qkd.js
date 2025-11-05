// E91 QKD simulation (educational, simplified)
// - Generates entangled pairs (conceptually), random measurement bases, and outcomes
// - Computes sifted key after basis reconciliation
// - Estimates QBER; if above threshold, marks breach

function randomBits(length) {
	const bits = new Uint8Array(length);
	for (let i = 0; i < length; i++) bits[i] = Math.random() < 0.5 ? 0 : 1;
	return bits;
}

function xorBits(a, b) {
	const out = new Uint8Array(a.length);
	for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
	return out;
}

function bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function textToBytes(text) { return new TextEncoder().encode(text); }
function bytesToText(bytes) { return new TextDecoder().decode(bytes); }

// Map bases indices to angles (E91 uses specific CHSH angles; here we emulate compatibility)
const BASES = [0, 45]; // degrees; simplified two-basis scheme for gameplay

function simulateE91Detailed(opts) {
	const { pairCount = 256, evePresent = false, logLimit = 16 } = opts || {};

	// Alice (tank) and Bob (control) choose random bases
	const aliceBases = randomBits(pairCount);
	const bobBases = randomBits(pairCount);

	// Ideal E91 correlations: when bases match, outcomes match (perfect correlation)
	// When bases differ, outcomes are random relative to each other
	// Eavesdropper introduces errors by collapsing state in random basis

	const aliceOutcomes = randomBits(pairCount);
	const bobOutcomes = new Uint8Array(pairCount);

	// Build a preview array of pairs so the UI can visualize per-pair effects
	const pairs = [];

	for (let i = 0; i < pairCount; i++) {
		const basesMatch = aliceBases[i] === bobBases[i];
		let bit;
		if (basesMatch) {
			// Perfect correlation in ideal channel
			bit = aliceOutcomes[i];
			if (evePresent) {
				// Eve measuring randomly causes errors with ~25% rate after sifting (BB84 intuition);
				// for E91 we emulate a similar QBER effect.
				if (Math.random() < 0.25) bit ^= 1;
			}
			bobOutcomes[i] = bit;
		} else {
			// Incompatible bases: uncorrelated
			bobOutcomes[i] = Math.random() < 0.5 ? 0 : 1;
		}

		// store a lightweight preview of this pair for visualization
		const altered = basesMatch && (aliceOutcomes[i] !== bobOutcomes[i]);
		pairs.push({
			index: i,
			aliceBase: aliceBases[i],
			bobBase: bobBases[i],
			aliceOutcome: aliceOutcomes[i],
			bobOutcome: bobOutcomes[i],
			basesMatch,
			altered // true when the pair was effectively changed (e.g., by Eve)
		});
	}

	// Sifting: keep positions where bases match
	const siftedPositions = [];
	for (let i = 0; i < pairCount; i++) if (aliceBases[i] === bobBases[i]) siftedPositions.push(i);

	const aliceKey = new Uint8Array(siftedPositions.length);
	const bobKey = new Uint8Array(siftedPositions.length);

	let errorCount = 0;
	for (let j = 0; j < siftedPositions.length; j++) {
		const i = siftedPositions[j];
		aliceKey[j] = aliceOutcomes[i];
		bobKey[j] = bobOutcomes[i];
		if (aliceKey[j] !== bobKey[j]) errorCount++;
	}

	const qber = siftedPositions.length ? errorCount / siftedPositions.length : 0;
	const breach = qber > 0.11; // typical threshold ballpark

	// Simple CHSH-like calculation for display
	const sValue = evePresent ? 1.8 + Math.random() * 0.4 : 2.4 + Math.random() * 0.3;
	const chshViolated = sValue > 2.0;

	const logs = [];
	// Use the pairs preview to generate human-readable logs
	for (let i = 0; i < Math.min(logLimit, pairs.length); i++) {
		const p = pairs[i];
		logs.push(`Pair ${p.index}: Alice(${BASES[p.aliceBase]}°)=${p.aliceOutcome} Bob(${BASES[p.bobBase]}°)=${p.bobOutcome}`);
	}
	logs.push(`Sifting kept ${siftedPositions.length} pairs`);
	logs.push(`QBER = ${(qber * 100).toFixed(2)}% , CHSH S = ${sValue.toFixed(2)} ${chshViolated ? '(violation)' : '(no violation)'}`);
	if (breach) logs.push('Channel insecure: abort key'); else logs.push('Channel secure: key established');

	return { aliceKey, bobKey, qber, S: sValue, chshViolated, breach, kept: siftedPositions.length, logs, pairsPreview: pairs.slice(0, Math.min(24, pairs.length)) };
}

function deriveOtpKeyBits(keyBits, byteLen) {
	if (!keyBits || keyBits.length === 0) return new Uint8Array(byteLen * 8);
	if (keyBits.length < byteLen * 8) {
		const needed = byteLen * 8;
		const extended = new Uint8Array(needed);
		for (let i = 0; i < needed; i++) extended[i] = keyBits[i % keyBits.length];
		return extended;
	}
	return keyBits.slice(0, byteLen * 8);
}

function bitsToBytes(bits) {
	const n = Math.ceil(bits.length / 8);
	const out = new Uint8Array(n);
	for (let i = 0; i < bits.length; i++) {
		const bIndex = i >> 3;
		out[bIndex] = (out[bIndex] << 1) | bits[i];
		if ((i & 7) === 7) { /* byte aligned */ }
	}
	const shift = (8 - (bits.length % 8)) % 8;
	if (shift !== 0) {
		for (let i = n - 1; i >= 0; i--) { out[i] = (out[i] << shift) & 0xff; }
	}
	return out;
}

function bytesToBits(bytes) {
	const bits = new Uint8Array(bytes.length * 8);
	let k = 0;
	for (let i = 0; i < bytes.length; i++) for (let b = 7; b >= 0; b--) bits[k++] = (bytes[i] >> b) & 1;
	return bits;
}

function otpEncrypt(plaintext) {
	const msgBytes = textToBytes(plaintext);
	const keyBits = window.__qkd_key_bits || randomBits(msgBytes.length * 8);
	const otpBits = deriveOtpKeyBits(keyBits, msgBytes.length);
	const msgBits = bytesToBits(msgBytes);
	const cipherBits = xorBits(msgBits, otpBits);
	const cipherBytes = bitsToBytes(cipherBits);
	return { cipherBytes, keyBitsUsed: otpBits };
}

function otpDecrypt(cipherBytes, keyBits) {
	const otpBits = deriveOtpKeyBits(keyBits, cipherBytes.length);
	const cipherBits = bytesToBits(cipherBytes);
	const msgBits = xorBits(cipherBits, otpBits);
	const msgBytes = bitsToBytes(msgBits);
	return bytesToText(msgBytes);
}

window.QKD = { simulateE91Detailed, otpEncrypt, otpDecrypt, bytesToHex, randomBits };
