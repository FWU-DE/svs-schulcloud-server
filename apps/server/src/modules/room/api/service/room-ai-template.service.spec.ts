import { InternalServerErrorException } from '@nestjs/common';
import { RoomAiConfig } from '../../room.config';
import { RoomAiTemplateItem, RoomAiTemplateService } from './room-ai-template.service';

describe('RoomAiTemplateService', () => {
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
			checkLinks?: boolean;
			linkStatus?: number | 'unreachable';
		} = {}
	) => {
		const {
			chunks = [],
			ok = true,
			apiKey = 'test-key',
			apiStyle = 'openai',
			checkLinks = false,
			linkStatus = 200,
		} = options;

		const config = new RoomAiConfig();
		config.aiApiUrl = 'https://ai.example.org/v1/chat/completions';
		config.aiApiKey = apiKey;
		config.aiModel = 'test-model';
		config.aiApiStyle = apiStyle;
		config.aiCheckLinks = checkLinks;

		const fetchMock = jest.fn().mockImplementation((url: string, init?: { method?: string }) => {
			if (init?.method === 'HEAD') {
				return linkStatus === 'unreachable'
					? Promise.reject(new Error('getaddrinfo ENOTFOUND'))
					: Promise.resolve({ ok: true, status: linkStatus });
			}

			return Promise.resolve({ ok, status: ok ? 200 : 429, body: ok ? streamOf(chunks) : null });
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		return { service: new RoomAiTemplateService(config), fetchMock };
	};

	const collect = async (generator: AsyncGenerator<RoomAiTemplateItem>): Promise<RoomAiTemplateItem[]> => {
		const items: RoomAiTemplateItem[] = [];
		for await (const item of generator) {
			items.push(item);
		}
		return items;
	};

	describe('isConfigured', () => {
		it('should be false without an api key', () => {
			const { service } = setup({ apiKey: '' });

			expect(service.isConfigured()).toBe(false);
		});

		it('should be true with an api key', () => {
			const { service } = setup();

			expect(service.isConfigured()).toBe(true);
		});
	});

	describe('generate', () => {
		it('should send prompt and model to the configured api', async () => {
			const { service, fetchMock } = setup({ chunks: completionEvents([]) });

			await collect(service.generate('Mathe 9b, Bruchrechnung'));

			expect(fetchMock).toHaveBeenCalledWith(
				'https://ai.example.org/v1/chat/completions',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) as Record<string, string>,
				})
			);
			const [, requestInit] = fetchMock.mock.calls[0] as [string, { body: string }];
			const body = JSON.parse(requestInit.body) as {
				model: string;
				stream: boolean;
				messages: { role: string; content: string }[];
			};
			expect(body.model).toBe('test-model');
			expect(body.stream).toBe(true);
			expect(body.messages[1]).toEqual({ role: 'user', content: 'Mathe 9b, Bruchrechnung' });
		});

		it('should send the key the way azure expects it', async () => {
			const { service, fetchMock } = setup({ chunks: completionEvents([]), apiStyle: 'azure' });

			await collect(service.generate('Mathe'));

			const [, requestInit] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
			expect(requestInit.headers).toEqual(expect.objectContaining({ 'api-key': 'test-key' }));
			expect(requestInit.headers.Authorization).toBeUndefined();
		});

		it('should yield the items of the stream', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'{"type":"roomName","name":"Mathe 9b"}\n',
					'{"type":"board","title":"Übersicht","layout":"list"}\n',
					'{"type":"column","title":"Woche 1"}\n{"type":"card","title":"Ziele","elements":[{"kind":"text","text":"<p>Los</p>"}]}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([
				{ type: 'roomName', name: 'Mathe 9b' },
				{ type: 'board', title: 'Übersicht', layout: 'list' },
				{ type: 'column', title: 'Woche 1' },
				{ type: 'card', title: 'Ziele', color: undefined, elements: [{ kind: 'text', text: '<p>Los</p>' }] },
			]);
		});

		it('should join items that arrive in several chunks', async () => {
			const { service } = setup({
				chunks: completionEvents(['{"type":"roomName",', '"name":"Mathe', ' 9b"}\n']),
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([{ type: 'roomName', name: 'Mathe 9b' }]);
		});

		it('should yield a last item that has no trailing newline', async () => {
			const { service } = setup({
				chunks: completionEvents(['{"type":"board","title":"Plan"}']),
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([{ type: 'board', title: 'Plan', layout: 'columns' }]);
		});

		it('should skip lines that are not usable items', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'```json\n',
					'{"type":"card","title":"ohne Board"}\n',
					'{"type":"board","title":"Plan","layout":"columns"}\n',
					'{"type":"unknown","title":"x"}\n',
					'{"type":"board"}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([{ type: 'board', title: 'Plan', layout: 'columns' }]);
		});

		it('should stop taking columns beyond the requested maximum', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n',
					'{"type":"column","title":"1"}\n{"type":"column","title":"2"}\n{"type":"column","title":"3"}\n',
					'{"type":"card","title":"in der dritten Spalte"}\n',
				]),
			});

			const items = await collect(service.generate('Mathe', 2));

			expect(items.filter((item) => item.type === 'column')).toHaveLength(2);
			expect(items.some((item) => item.type === 'card')).toBe(false);
		});

		it('should take over every content type of a card', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n{"type":"board","title":"Anhang","layout":"list"}\n',
					'{"type":"column","title":"Material"}\n',
					'{"type":"card","title":"Sammlung","color":"teal","elements":[',
					'{"kind":"text","text":"<p>Los</p>"},{"kind":"link","title":"Serlo","url":"https://de.serlo.org"},',
					'{"kind":"folder","title":"Material"},{"kind":"boardLink","title":"Zum Anhang","board":2}]}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card');

			expect(card).toEqual({
				type: 'card',
				title: 'Sammlung',
				color: 'teal',
				elements: [
					{ kind: 'text', text: '<p>Los</p>' },
					{ kind: 'link', title: 'Serlo', url: 'https://de.serlo.org/' },
					{ kind: 'folder', title: 'Material' },
					// the model counts boards from one, the client from zero
					{ kind: 'boardLink', title: 'Zum Anhang', boardIndex: 1 },
				],
			});
		});

		it('should drop a colour that the board does not know', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n{"type":"column","title":"Material"}\n',
					'{"type":"card","title":"Sammlung","color":"neon"}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));

			expect(items.find((item) => item.type === 'card')).toEqual({
				type: 'card',
				title: 'Sammlung',
				color: undefined,
				elements: [],
			});
		});

		it('should drop links that are not public https addresses', async () => {
			const { service } = setup({
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n{"type":"column","title":"Material"}\n',
					'{"type":"card","title":"Sammlung","elements":[{"kind":"link","title":"Intern","url":"http://intranet/wiki"},',
					'{"kind":"link","title":"Datei","url":"file:///etc/passwd"},{"kind":"link","title":"Ok","url":"https://de.wikipedia.org"}]}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card') as { elements: unknown[] };

			expect(card.elements).toEqual([{ kind: 'link', title: 'Ok', url: 'https://de.wikipedia.org/' }]);
		});

		it('should drop a link that does not resolve', async () => {
			const { service } = setup({
				checkLinks: true,
				linkStatus: 404,
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n{"type":"column","title":"Material"}\n',
					'{"type":"card","title":"Sammlung","elements":[{"kind":"link","title":"Weg","url":"https://example.org/gibt-es-nicht"}]}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card') as { elements: unknown[] };

			expect(card.elements).toEqual([]);
		});

		it('should keep a link that answers, even when it dislikes HEAD', async () => {
			const { service } = setup({
				checkLinks: true,
				linkStatus: 405,
				chunks: completionEvents([
					'{"type":"board","title":"Plan","layout":"columns"}\n{"type":"column","title":"Material"}\n',
					'{"type":"card","title":"Sammlung","elements":[{"kind":"link","title":"Da","url":"https://example.org/artikel"}]}\n',
				]),
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card') as { elements: unknown[] };

			expect(card.elements).toEqual([{ kind: 'link', title: 'Da', url: 'https://example.org/artikel' }]);
		});

		it('should fail when the api rejects the request', async () => {
			const { service } = setup({ ok: false });

			await expect(collect(service.generate('Mathe'))).rejects.toThrow(InternalServerErrorException);
		});
	});
});
