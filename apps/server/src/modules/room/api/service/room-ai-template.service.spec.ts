import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { type AiSuggestionService } from '@modules/ai-suggestion';
import { type RoomAiTemplateItem, RoomAiTemplateService } from './room-ai-template.service';

describe('RoomAiTemplateService', () => {
	const setup = (options: { lines?: unknown[]; checkLinks?: boolean; deadLinks?: string[] } = {}) => {
		const { lines = [], checkLinks = false, deadLinks = [] } = options;

		const aiSuggestionService: DeepMocked<AiSuggestionService> = createMock<AiSuggestionService>({
			checksLinks: checkLinks,
		});
		// eslint-disable-next-line @typescript-eslint/require-await
		aiSuggestionService.streamJsonLines.mockImplementation(async function* stream() {
			for (const line of lines) {
				yield line;
			}
		});
		aiSuggestionService.publicUrl.mockImplementation((url: unknown) =>
			typeof url === 'string' && url.startsWith('https://') ? url : undefined
		);
		aiSuggestionService.doesResolve.mockImplementation((url: string) => Promise.resolve(!deadLinks.includes(url)));

		return { service: new RoomAiTemplateService(aiSuggestionService), aiSuggestionService };
	};

	const collect = async (generator: AsyncGenerator<RoomAiTemplateItem>): Promise<RoomAiTemplateItem[]> => {
		const items: RoomAiTemplateItem[] = [];
		for await (const item of generator) {
			items.push(item);
		}
		return items;
	};

	const board = { type: 'board', title: 'Plan', layout: 'columns' };
	const column = { type: 'column', title: 'Material' };

	describe('generate', () => {
		it('should ask with the column limit of the request', async () => {
			const { service, aiSuggestionService } = setup();

			await collect(service.generate('Mathe 9b', 3));

			const [systemPrompt, userPrompt] = aiSuggestionService.streamJsonLines.mock.calls[0];
			expect(systemPrompt).toContain('at most 3 columns');
			expect(userPrompt).toBe('Mathe 9b');
		});

		it('should take over the structure of the model', async () => {
			const { service } = setup({
				lines: [
					{ type: 'roomName', name: 'Mathe 9b' },
					{ type: 'board', title: 'Übersicht', layout: 'list' },
					column,
					{ type: 'card', title: 'Ziele', elements: [{ kind: 'text', text: '<p>Los</p>' }] },
				],
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([
				{ type: 'roomName', name: 'Mathe 9b' },
				{ type: 'board', title: 'Übersicht', layout: 'list' },
				{ type: 'column', title: 'Material' },
				{ type: 'card', title: 'Ziele', color: undefined, elements: [{ kind: 'text', text: '<p>Los</p>' }] },
			]);
		});

		it('should take over every content type of a card', async () => {
			const { service } = setup({
				lines: [
					board,
					{ type: 'board', title: 'Anhang', layout: 'list' },
					column,
					{
						type: 'card',
						title: 'Sammlung',
						color: 'teal',
						elements: [
							{ kind: 'text', text: '<p>Los</p>' },
							{ kind: 'link', title: 'Serlo', url: 'https://de.serlo.org' },
							{ kind: 'folder', title: 'Material' },
							{ kind: 'boardLink', title: 'Zum Anhang', board: 2 },
						],
					},
				],
			});

			const items = await collect(service.generate('Mathe'));

			expect(items.find((item) => item.type === 'card')).toEqual({
				type: 'card',
				title: 'Sammlung',
				color: 'teal',
				elements: [
					{ kind: 'text', text: '<p>Los</p>' },
					{ kind: 'link', title: 'Serlo', url: 'https://de.serlo.org' },
					{ kind: 'folder', title: 'Material' },
					// the model counts boards from one, the client from zero
					{ kind: 'boardLink', title: 'Zum Anhang', boardIndex: 1 },
				],
			});
		});

		it('should drop a colour the board does not know', async () => {
			const { service } = setup({
				lines: [board, column, { type: 'card', title: 'Sammlung', color: 'neon' }],
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
				lines: [
					board,
					column,
					{
						type: 'card',
						title: 'Sammlung',
						elements: [
							{ kind: 'link', title: 'Intern', url: 'http://intranet/wiki' },
							{ kind: 'link', title: 'Ok', url: 'https://de.wikipedia.org' },
						],
					},
				],
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card') as { elements: unknown[] };

			expect(card.elements).toEqual([{ kind: 'link', title: 'Ok', url: 'https://de.wikipedia.org' }]);
		});

		it('should drop a link that does not resolve', async () => {
			const { service } = setup({
				checkLinks: true,
				deadLinks: ['https://example.org/gibt-es-nicht'],
				lines: [
					board,
					column,
					{
						type: 'card',
						title: 'Sammlung',
						elements: [{ kind: 'link', title: 'Weg', url: 'https://example.org/gibt-es-nicht' }],
					},
				],
			});

			const items = await collect(service.generate('Mathe'));
			const card = items.find((item) => item.type === 'card') as { elements: unknown[] };

			expect(card.elements).toEqual([]);
		});

		it('should skip items that have no place in a room', async () => {
			const { service } = setup({
				lines: [{ type: 'card', title: 'ohne Board' }, board, { type: 'unknown', title: 'x' }, { type: 'board' }],
			});

			const items = await collect(service.generate('Mathe'));

			expect(items).toEqual([{ type: 'board', title: 'Plan', layout: 'columns' }]);
		});

		it('should stop taking columns beyond the requested maximum', async () => {
			const { service } = setup({
				lines: [
					board,
					{ type: 'column', title: '1' },
					{ type: 'column', title: '2' },
					{ type: 'column', title: '3' },
					{ type: 'card', title: 'in der dritten Spalte' },
				],
			});

			const items = await collect(service.generate('Mathe', 2));

			expect(items.filter((item) => item.type === 'column')).toHaveLength(2);
			expect(items.some((item) => item.type === 'card')).toBe(false);
		});
	});

	describe('isConfigured', () => {
		it('should follow the shared ai service', () => {
			const { service, aiSuggestionService } = setup();
			aiSuggestionService.isConfigured.mockReturnValue(true);

			expect(service.isConfigured()).toBe(true);
		});
	});
});
