import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AiSuggestionService } from '@modules/ai-suggestion';
import { cardFactory, richTextElementFactory } from '../testing';
import { BoardAiCard, BoardAiCardsService } from './board-ai-cards.service';

describe('BoardAiCardsService', () => {
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

		return { service: new BoardAiCardsService(aiSuggestionService), aiSuggestionService };
	};

	const collect = async (generator: AsyncGenerator<BoardAiCard>): Promise<BoardAiCard[]> => {
		const cards: BoardAiCard[] = [];
		for await (const card of generator) {
			cards.push(card);
		}
		return cards;
	};

	const sourceCard = () =>
		cardFactory.build({
			title: 'Fotosynthese',
			children: [richTextElementFactory.build({ text: '<p>Pflanzen bauen Glukose auf.</p>' })],
		});

	describe('generate', () => {
		it('should hand the material of the source to the model', async () => {
			const { service, aiSuggestionService } = setup();

			await collect(service.generate([sourceCard()], 'exercises'));

			const [systemPrompt, userPrompt] = aiSuggestionService.streamJsonLines.mock.calls[0];
			expect(systemPrompt).toContain('exercise cards');
			expect(userPrompt).toContain('Fotosynthese');
			expect(userPrompt).toContain('Pflanzen bauen Glukose auf.');
		});

		it('should say so when the source card is still empty', async () => {
			const { service, aiSuggestionService } = setup();

			await collect(service.generate([cardFactory.build({ title: '', children: [] })], 'differentiate'));

			const [, userPrompt] = aiSuggestionService.streamJsonLines.mock.calls[0];
			expect(userPrompt).toContain('leer');
		});

		it('should pass the instruction of the teacher for the free preset', async () => {
			const { service, aiSuggestionService } = setup();

			await collect(service.generate([sourceCard()], 'free', 'Schreibe drei Exit-Ticket-Fragen'));

			const [, userPrompt] = aiSuggestionService.streamJsonLines.mock.calls[0];
			expect(userPrompt).toContain('Schreibe drei Exit-Ticket-Fragen');
		});

		it('should take over title, colour and content of a suggested card', async () => {
			const { service } = setup({
				lines: [
					{
						type: 'card',
						title: 'Basisaufgabe',
						color: 'red',
						elements: [
							{ kind: 'text', text: '<p>Beschreibe den Vorgang.</p>' },
							{ kind: 'link', title: 'Wikipedia', url: 'https://de.wikipedia.org/wiki/Photosynthese' },
						],
					},
				],
			});

			const cards = await collect(service.generate([sourceCard()], 'exercises'));

			expect(cards).toEqual([
				{
					type: 'card',
					title: 'Basisaufgabe',
					color: 'red',
					elements: [
						{ kind: 'text', text: '<p>Beschreibe den Vorgang.</p>' },
						{ kind: 'link', title: 'Wikipedia', url: 'https://de.wikipedia.org/wiki/Photosynthese' },
					],
				},
			]);
		});

		it('should skip lines that are not cards', async () => {
			const { service } = setup({
				lines: [{ type: 'column', title: 'Spalte' }, { type: 'card' }, { type: 'card', title: 'Gut' }],
			});

			const cards = await collect(service.generate([sourceCard()], 'exercises'));

			expect(cards.map((card) => card.title)).toEqual(['Gut']);
		});

		it('should drop a link that does not resolve', async () => {
			const { service } = setup({
				checkLinks: true,
				deadLinks: ['https://example.org/erfunden'],
				lines: [
					{
						type: 'card',
						title: 'Material',
						elements: [{ kind: 'link', title: 'Weg', url: 'https://example.org/erfunden' }],
					},
				],
			});

			const cards = await collect(service.generate([sourceCard()], 'exercises'));

			expect(cards[0].elements).toEqual([]);
		});

		it('should stop after six cards, however long the model keeps writing', async () => {
			const { service } = setup({
				lines: Array.from({ length: 12 }, (_unused, index) => ({ type: 'card', title: `Karte ${index + 1}` })),
			});

			const cards = await collect(service.generate([sourceCard()], 'free', 'Schreib viel'));

			expect(cards).toHaveLength(6);
		});
	});
});
