import FuseUtils from '@fuse/utils';
import { jwtDecode } from 'jwt-decode';
import type { PartialDeep } from 'type-fest';
import UserModel from '@auth/user/models/UserModel';
import type { User } from '@auth/user';
import { http, HttpResponse } from 'msw';
import mockApi from '../mockApi';

type UserAuthType = User & { password: string };

const authApi = [
	http.post('/api/mock/auth/refresh', async ({ request }) => {
		const newTokenResponse = await generateAccessToken(request);

		if (newTokenResponse) {
			const { access_token } = newTokenResponse;

			return HttpResponse.json(null, { status: 200, headers: { 'New-Access-Token': access_token } });
		}

		const error = 'Invalid access token detected or user not found';

		return HttpResponse.json({ error }, { status: 401 });
	}),

	http.get('/api/mock/auth/sign-in-with-token', async ({ request }) => {
		const newTokenResponse = await generateAccessToken(request);

		if (newTokenResponse) {
			const { access_token, user } = newTokenResponse;
			return HttpResponse.json(user, { status: 200, headers: { 'New-Access-Token': access_token } });
		}

		const error = 'Invalid access token detected or user not found';

		return HttpResponse.json({ error }, { status: 401 });
	}),

	http.post('/api/mock/auth/sign-in', async ({ request }) => {
		const api = mockApi('users');

		const data = (await request.json()) as { email: string; password: string };

		const { email, password } = data;
		const foundUsers = await api.findAll({ email });
		const user = foundUsers?.[0] as UserAuthType | undefined;

		const error = [];

		if (!user) {
			error.push({
				type: 'email',
				message: 'Check your email address'
			});
		}

		if (user && password === '') {
			error.push({
				type: 'password',
				message: 'Check your password'
			});
		}

		if (error.length === 0) {
			// @ts-expect-error — framework code, strict null check
			delete user.password;

			// @ts-expect-error — framework code, strict null check
			const access_token = await generateJWTToken({ id: user.id });

			const response = {
				user,
				access_token
			};

			return HttpResponse.json(response, { status: 200 });
		}

		return HttpResponse.json(error, { status: 404 });
	}),

	http.post('/api/mock/auth/sign-up', async ({ request }) => {
		const api = mockApi('users');
		const data = (await request.json()) as { displayName: string; password: string; email: string };
		const { displayName, password, email } = data;
		const isEmailExists = (await api.findAll({ email }))?.[0];
		const error = [];

		if (isEmailExists) {
			error.push({
				type: 'email',
				message: 'The email address is already in use'
			});
		}

		if (error.length === 0) {
			const newUser = UserModel({
				role: ['admin'],
				displayName,
				photoURL: '/assets/images/avatars/Abbott.jpg',
				email,
				shortcuts: [],
				settings: {}
			});

			newUser.id = FuseUtils.generateGUID();
			newUser.password = password;

			const user = await api.create(newUser);

			delete user.password;

			const access_token = await generateJWTToken({ id: user.id });

			const response = {
				user,
				access_token
			};

			return HttpResponse.json(response, { status: 200 });
		}

		return HttpResponse.json(error, { status: 404 });
	}),

	http.get('/api/mock/auth/user/:id', async ({ params }) => {
		const api = mockApi('users');
		const { id } = params as Record<string, string>;
		const item = await api.find(id);

		if (!item) {
			return HttpResponse.json({ message: 'User not found' }, { status: 404 });
		}

		return HttpResponse.json(item);
	}),

	http.get('/api/mock/auth/user-by-email/:email', async ({ params }) => {
		const api = mockApi('users');
		const { email } = params as Record<string, string>;
		const item = await api.find({ email });

		if (!item) {
			return HttpResponse.json({ message: 'User not found' }, { status: 404 });
		}

		return HttpResponse.json(item);
	}),

	http.put('/api/mock/auth/user/:id', async ({ params, request }) => {
		const api = mockApi('users');
		const { id } = params as Record<string, string>;

		const data = (await request.json()) as { user: PartialDeep<UserAuthType> };

		const updatedUser = await api.update(id, data);

		delete (updatedUser as Partial<UserAuthType>).password;

		return HttpResponse.json(updatedUser);
	})
];

export default authApi;

/**
 * JWT Token Generator/Verifier Helpers
 * !! Created for Demonstration Purposes, cannot be used for PRODUCTION
 *
 * Rewritten to use the platform's native Web Crypto API (`crypto.subtle`)
 * so the heavy `crypto-js` dependency can be dropped. HMAC-SHA256, base64,
 * and UTF-8 encoding are all available natively in modern browsers and
 * in jsdom (used by Vitest), so this works in both runtime and tests.
 */

const mockJwtSigningKey = 'mock-jwt-signing-key-for-msw-only';

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	// Standard base64, then translate to the URL-safe alphabet and trim padding
	// per RFC 7515 §2 (JWS base64url encoding).
	return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function stringToBase64Url(s: string): string {
	return bytesToBase64Url(new TextEncoder().encode(s));
}

let cachedKey: CryptoKey | null = null;

async function getHmacKey(): Promise<CryptoKey> {
	if (cachedKey) return cachedKey;
	cachedKey = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(mockJwtSigningKey),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
	return cachedKey;
}

async function hmacSign(message: string): Promise<string> {
	const key = await getHmacKey();
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return bytesToBase64Url(new Uint8Array(sig));
}

async function generateJWTToken(tokenPayload: { [key: string]: unknown }): Promise<string> {
	const header = { alg: 'HS256', typ: 'JWT' };

	const date = new Date();
	const iat = Math.floor(date.getTime() / 1000);
	const exp = Math.floor(date.setDate(date.getDate() + 7) / 1000);

	const payload = { iat, iss: 'Fuse', exp, ...tokenPayload };

	const encodedHeader = stringToBase64Url(JSON.stringify(header));
	const encodedPayload = stringToBase64Url(JSON.stringify(payload));
	const signature = await hmacSign(`${encodedHeader}.${encodedPayload}`);

	return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function verifyJWTToken(token: string): Promise<boolean> {
	const parts = token.split('.');
	if (parts.length !== 3) return false;
	const [header, payload, signature] = parts;
	const expected = await hmacSign(`${header}.${payload}`);
	return signature === expected;
}

/**
 * Generate Access Token
 */
async function generateAccessToken(request: Request): Promise<{ access_token: string; user: User } | null> {
	const authHeader = request.headers.get('Authorization') as string;

	if (!authHeader) {
		return null;
	}

	const [scheme, access_token] = authHeader.split(' ');

	if (scheme !== 'Bearer' || !access_token) {
		return null;
	}

	if (await verifyJWTToken(access_token)) {
		const { id }: { id: string } = jwtDecode(access_token);

		const user = await mockApi('users').find(id) as User | undefined;

		if (user) {
			delete user.password;
			const access_token = await generateJWTToken({ id: user.id });
			return { access_token, user };
		}
	}

	return null;
}
