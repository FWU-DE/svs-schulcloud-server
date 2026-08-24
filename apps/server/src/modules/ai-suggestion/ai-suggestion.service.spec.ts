import { InternalServerErrorException } from '@nestjs/common';
import { AiSuggestionConfig } from './ai-suggestion.config';
import { AiSuggestionService } from './ai-suggestion.service';

describe('AiSuggestionService', () => {
	const encoder = new TextEncoder();

	const streamOf = (chunks: string[]): AsyncIterable<Uint8Array> => {
		return {
			// eslint-disable-next-line @typescript-eslint/require-await
			async *[Symbol.asyncIterator]() {
				for (const chunk of chunks) {
					yield encoder.encode(chunk);
				}
			},
		};
	};

	/** the completion api sends server sent events whose content carries our json lines */
	const completionEvents = (content: string[]): string[] => [
		...content.map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n`),
		'data: [DONE]\n',
	];

	const setup = (
		options: {
			chunks?: string[];
			ok?: boolean;
			apiKey?: string;
			apiStyle?: 'openai' | 'azure';
			linkStatus?: number | 'unreachable';
		} = {}
	) => {
		const { chunks = [], ok = true, apiKey = 'test-key', apiStyle = 'openai', linkStatus = 200 } = options;

		const config = new AiSuggestionConfig();
		config.apiUrl = 'https://ai.example.org/v1/chat/completions';
		config.apiKey = apiKey;
		config.model = 'test-model';
		config.apiStyle = apiStyle;

		const fetchMock = jest.fn().mockImplementation((url: string, init?: { method?: string }) => {
			if (init?.method === 'HEAD') {
				return linkStatus === 'unreachable'
					? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
					: Promise.resolve({ ok: true, status: linkStatus });
			}

			return Promise.resolve({ ok, status: ok ? 200 : 429, body: ok ? streamOf(chunks) : null });
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		return { service: new AiSuggestionService(config), fetchMock };
	};

	const collect = async (generator: AsyncGenerator<unknown>): Promise<unknown[]> => {
		const items: unknown[] = [];
		for await (const item of generator) {
			items.push(item);
		}
		return items;
	};

	describe('isConfigured', () => {
		it('should be false without an api key', () => {
			expect(setup({ apiKey: '' }).service.isConfigured()).toBe(false);
		});

		it('should be true with an api key', () => {
			expect(setup().service.isConfigured()).toBe(true);
		});
	});

	describe('streamJsonLines', () => {
		it('should send both prompts and the model to the configured api', async () => {
			const { service, fetchMock } = setup({ chunks: completionEvents([]) });

			await collect(service.streamJsonLines('system says', 'user asks'));

			const [url, requestInit] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
			expect(url).toBe('https://ai.example.org/v1/chat/completions');
			expect(requestInit.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-key' }));

			const body = JSON.parse(requestInit.body) as {
				model: string;
				stream: boolean;
				messages: { role: string; content: string }[];
			};
			expect(body.model).toBe('test-model');
			expect(body.stream).toBe(true);
			expect(body.messages).toEqual([
				{ role: 'system', content: 'system says' },
				{ role: 'user', content: 'user asks' },
			]);
		});

		it('should send the key the way azure expects it', async () => {
			const { service, fetchMock } = setup({ chunks: completionEvents([]), apiStyle: 'azure' });

			await collect(service.streamJsonLines('system', 'user'));

			const [, requestInit] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
			expect(requestInit.headers).toEqual(expect.objectContaining({ 'api-key': 'test-key' }));
			expect(requestInit.headers.Authorization).toBeUndefined();
		});

		it('should yield one object per line', async () => {
			const { service } = setup({
				chunks: completionEvents(['{"a":1}\n{"b":2}\n']),
			});

			const items = await collect(service.streamJsonLines('system', 'user'));

			expect(items).toEqual([{ a: 1 }, { b: 2 }]);
		});

		it('should join a line that arrives in several chunks', async () => {
			const { service } = setup({ chunks: completionEvents(['{"title":"Foto', 'synthese"}\n']) });

			const items = await collect(service.streamJsonLines('system', 'user'));

			expect(items).toEqual([{ title: 'Fotosynthese' }]);
		});

		it('should yield a last line that has no trailing newline', async () => {
			const { service } = setup({ chunks: completionEvents(['{"a":1}']) });

			const items = await collect(service.streamJsonLines('system', 'user'));

			expect(items).toEqual([{ a: 1 }]);
		});

		it('should skip lines that are not json', async () => {
			const { service } = setup({ chunks: completionEvents(['```json\n', '{"a":1}\n', 'Viel Erfolg!\n']) });

			const items = await collect(service.streamJsonLines('system', 'user'));

			expect(items).toEqual([{ a: 1 }]);
		});

		it('should fail when the api rejects the request', async () => {
			const { service } = setup({ ok: false });

			await expect(collect(service.streamJsonLines('system', 'user'))).rejects.toThrow(InternalServerErrorException);
		});
	});

	describe('publicUrl', () => {
		it.each([
			['https://de.wikipedia.org/wiki/Photosynthese', 'https://de.wikipedia.org/wiki/Photosynthese'],
			['  https://serlo.org  ', 'https://serlo.org/'],
		])('should accept %s', (given, expected) => {
			expect(setup().service.publicUrl(given)).toBe(expected);
		});

		it.each([
			{ reason: 'kein https', url: 'http://de.wikipedia.org' as unknown },
			{ reason: 'kein web-schema', url: 'file:///etc/passwd' as unknown },
			{ reason: 'kein öffentlicher host', url: 'https://intranet/wiki' as unknown },
			{ reason: 'mit zugangsdaten', url: 'https://user:pw@example.org' as unknown },
			{ reason: 'gar keine adresse', url: 'kein link' as unknown },
			{ reason: 'keine zeichenkette', url: 42 as unknown },
		])('should reject an address that is $reason', ({ url }) => {
			expect(setup().service.publicUrl(url)).toBeUndefined();
		});
	});

	describe('doesResolve', () => {
		it('should accept a page that answers', async () => {
			await expect(setup({ linkStatus: 200 }).service.doesResolve('https://example.org')).resolves.toBe(true);
		});

		it('should accept a page that dislikes HEAD', async () => {
			await expect(setup({ linkStatus: 405 }).service.doesResolve('https://example.org')).resolves.toBe(true);
		});

		it.each([404, 410])('should reject a page that answers %s', async (linkStatus) => {
			await expect(setup({ linkStatus }).service.doesResolve('https://example.org')).resolves.toBe(false);
		});

		it('should reject a host that cannot be reached', async () => {
			await expect(setup({ linkStatus: 'unreachable' }).service.doesResolve('https://example.invalid')).resolves.toBe(
				false
			);
		});
	});
});
