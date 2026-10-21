'use strict';
// decode-uri-component 0.5.0's decoder (MIT, Sam Verschueren; see `license`), written as CommonJS with
// the 0.2.2 interface ("+" reads as a space) for query-string 7, which expo-router 57 uses and which
// cannot load the ES-module-only 0.5.0. Version 0.2.2 retried malformed input in a way that grows very
// fast with its length (GHSA-vcc3-ghjq-m6fr), so a crafted link could stall the app; 0.5.0 reads it in
// one pass. Wired in by the root package.json: the `decode-uri-component` dependency (`file:`) and the
// `decode-uri-component` override. Once expo-router's query-string uses decode-uri-component 0.5.0 or
// newer, remove this folder together with both of those lines, then run `npm install`.

// Matches one or more consecutive percent-encoded bytes (e.g. `%C3%A5`).
const token = '%[a-f0-9]{2}';
const multiMatcher = new RegExp('(' + token + ')+', 'gi');

const hexPair = /^[a-f\d]{2}$/i;

// Read a `%XX` sequence at `position`, returning the byte value and where to continue scanning.
function parsePercentByte(input, position) {
	if (input.charCodeAt(position) !== 37 || position + 3 > input.length) {
		return undefined;
	}

	const digits = input.slice(position + 1, position + 3);

	if (!hexPair.test(digits)) {
		return undefined;
	}

	return {byte: parseInt(digits, 16), next: position + 3};
}

// How many bytes a UTF-8 code point needs, from its lead byte; 0 for continuation and invalid bytes.
function utf8SequenceLength(byte) {
	if (byte <= 0x7F) {
		return 1;
	}

	// Start at 0xC2 to exclude overlong 2-byte encodings (0xC0/0xC1).
	if (byte >= 0xC2 && byte <= 0xDF) {
		return 2;
	}

	if (byte >= 0xE0 && byte <= 0xEF) {
		return 3;
	}

	if (byte >= 0xF0 && byte <= 0xF4) {
		return 4;
	}

	return 0;
}

function isContinuationByte(byte) {
	return byte >= 0x80 && byte <= 0xBF;
}

// Decode as much of `input` as possible without throwing: one left-to-right pass, decoding valid
// UTF-8 runs and leaving the rest literal.
function decode(input) {
	try {
		return decodeURIComponent(input);
	} catch {
		let output = '';
		let position = 0;

		while (position < input.length) {
			if (input.charCodeAt(position) !== 37) {
				output += input.charAt(position);
				position++;
				continue;
			}

			const firstByte = parsePercentByte(input, position);

			// `%` not followed by two hex digits (e.g. `%` or `%G`).
			if (!firstByte) {
				output += input.charAt(position);
				position++;
				continue;
			}

			const sequenceLength = utf8SequenceLength(firstByte.byte);

			// Continuation byte or invalid lead byte: keep one `%XX` literally.
			if (sequenceLength === 0) {
				output += input.slice(position, position + 3);
				position += 3;
				continue;
			}

			let end = firstByte.next;
			let validSequence = true;

			for (let index = 1; index < sequenceLength; index++) {
				const nextByte = parsePercentByte(input, end);

				if (!nextByte || !isContinuationByte(nextByte.byte)) {
					validSequence = false;
					break;
				}

				end = nextByte.next;
			}

			if (validSequence) {
				try {
					output += decodeURIComponent(input.slice(position, end));
					position = end;
					continue;
				} catch {
					// Invalid UTF-8 despite the right shape: keep the first byte literally.
				}
			}

			// Missing continuation bytes or a failed decode: keep the first byte literally.
			output += input.slice(position, position + 3);
			position += 3;
		}

		return output;
	}
}

function customDecodeURIComponent(input) {
	// Keep track of all the replacements and prefill the map with the `BOM`
	const replaceMap = {
		'%FE%FF': '��',
		'%FF%FE': '��',
	};

	// Find percent-encoded runs separated by literal text or lone `%` characters.
	let match = multiMatcher.exec(input);

	while (match) {
		try {
			// Decode as big chunks as possible
			replaceMap[match[0]] = decodeURIComponent(match[0]);
		} catch {
			const result = decode(match[0]);

			if (result !== match[0]) {
				replaceMap[match[0]] = result;
			}
		}

		match = multiMatcher.exec(input);
	}

	// Add `%C2` at the end of the map to make sure it does not replace the combinator before everything else
	replaceMap['%C2'] = '�';

	const entries = Object.keys(replaceMap);

	for (const key of entries) {
		// Replace all decoded components
		input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
	}

	return input;
}

module.exports = function (encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
	}

	try {
		encodedURI = encodedURI.replace(/\+/g, ' ');

		// Try the built in decoder first
		return decodeURIComponent(encodedURI);
	} catch {
		// Fallback to a more advanced decoder
		return customDecodeURIComponent(encodedURI);
	}
};
