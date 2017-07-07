
/**
 * request.js
 *
 * Request class contains server only options
 */

import { format as format_url, parse as parse_url } from 'url';
import Headers from './headers.js';
import Body, { clone, extractContentType, getTotalBytes } from './body';

const HEADERS = Symbol('headers');
const METHOD = Symbol('method');
const REDIRECT = Symbol('redirect');
const URL = Symbol('url');

/**
 * Request class
 *
 * @param   Mixed   input  Url or Request instance
 * @param   Object  init   Custom options
 * @return  Void
 */

export default class Request extends Body {
	constructor(input, init = {}) {
		let parsedURL;

		// normalize input
		if (!(input instanceof Request)) {
			if (input && input.href) {
				// in order to support Node.js' Url objects; though WHATWG's URL objects
				// will fall into this branch also (since their `toString()` will return
				// `href` property anyway)
				parsedURL = parse_url(input.href);
			} else {
				// coerce input to a string before attempting to parse
				parsedURL = parse_url(`${input}`);
			}
			input = {};
		} else {
			parsedURL = parse_url(input.url);
		}

		let method = init.method || input.method || 'GET';

		if ((init.body != null || input instanceof Request && input.body !== null) &&
			(method === 'GET' || method === 'HEAD')) {
			throw new TypeError('Request with GET/HEAD method cannot have body');
		}

		let inputBody = init.body != null ?
			init.body :
			input instanceof Request && input.body !== null ?
				clone(input) :
				null;

		super(inputBody, {
			timeout: init.timeout || input.timeout || 0,
			size: init.size || input.size || 0
		});

		// fetch spec options
		this[METHOD] = method.toUpperCase();
		this[REDIRECT] = init.redirect || input.redirect || 'follow';
		this[HEADERS] = new Headers(init.headers || input.headers || {});

		if (init.body != null) {
			const contentType = extractContentType(this);
			if (contentType !== null && !this[HEADERS].has('Content-Type')) {
				this[HEADERS].append('Content-Type', contentType);
			}
		}

		// server only options
		this.follow = init.follow !== undefined ?
			init.follow : input.follow !== undefined ?
			input.follow : 20;
		this.compress = init.compress !== undefined ?
			init.compress : input.compress !== undefined ?
			input.compress : true;
		this.counter = init.counter || input.counter || 0;
		this.agent = init.agent || input.agent;

		this[URL] = parsedURL;

		Object.defineProperty(this, Symbol.toStringTag, {
			value: 'Request',
			writeable: false,
			enumerable: false,
			configurable: true
		});
	}

	get headers() {
		return this[HEADERS];
	}

	get method() {
		return this[METHOD];
	}

	set method(m) {
		this[METHOD] = m.toUpperCase();
	}

	get redirect() {
		return this[REDIRECT];
	}

	get url() {
		return format_url(this[URL]);
	}

	/**
	 * Clone this request
	 *
	 * @return  Request
	 */
	clone() {
		return new Request(this);
	}
}

// make getters enumerable as per IDL
Object.defineProperty(Request.prototype, 'headers', { enumerable: true });
Object.defineProperty(Request.prototype, 'method', { enumerable: true });
Object.defineProperty(Request.prototype, 'redirect', { enumerable: true });
Object.defineProperty(Request.prototype, 'url', { enumerable: true });

Object.defineProperty(Request.prototype, Symbol.toStringTag, {
	value: 'RequestPrototype',
	writable: false,
	enumerable: false,
	configurable: true
});

export function getNodeRequestOptions(request) {
	const parsedURL = request[URL];
	const headers = new Headers(request.headers);

	// fetch step 3
	if (!headers.has('Accept')) {
		headers.set('Accept', '*/*');
	}

	// Basic fetch
	if (!parsedURL.protocol || !parsedURL.hostname) {
		throw new TypeError('Only absolute URLs are supported');
	}

	if (!/^https?:$/.test(parsedURL.protocol)) {
		throw new TypeError('Only HTTP(S) protocols are supported');
	}

	// HTTP-network-or-cache fetch steps 5-9
	let contentLengthValue = null;
	if (request.body == null && /^(POST|PUT)$/i.test(request.method)) {
		contentLengthValue = '0';
	}
	if (request.body != null) {
		const totalBytes = getTotalBytes(request);
		if (typeof totalBytes === 'number') {
			contentLengthValue = String(totalBytes);
		}
	}
	if (contentLengthValue) {
		headers.set('Content-Length', contentLengthValue);
	}

	// HTTP-network-or-cache fetch step 12
	if (!headers.has('User-Agent')) {
		headers.set('User-Agent', 'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)');
	}

	// HTTP-network-or-cache fetch step 16
	if (request.compress) {
		headers.set('Accept-Encoding', 'gzip,deflate');
	}
	if (!headers.has('Connection') && !request.agent) {
		headers.set('Connection', 'close');
	}

	// HTTP-network fetch step 4
	// chunked encoding is handled by Node.js

	return Object.assign({}, parsedURL, {
		method: request.method,
		headers: headers.raw(),
		agent: request.agent
	});
}
