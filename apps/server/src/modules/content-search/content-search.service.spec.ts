import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ContentSearchConfig } from './content-search.config';
import { ContentSearchService } from './content-search.service';
import { McpClientService } from './mcp-client.service';

describe('ContentSearchService', () => {
	const setup = (answer: unknown) => {
		const config = new ContentSearchConfig();
		config.relays = 'wss://amb-relay.edufeed.org,wss://oersi.edufeed.org';

		const mcpClientService: DeepMocked<McpClientService> = createMock<McpClientService>();
		mcpClientService.callTool.mockResolvedValue(answer);

		return { service: new ContentSearchService(config, mcpClientService), mcpClientService };
	};

	const resource = {
		name: 'Z-Schema Fotosynthese',
		description: 'Ein Diagramm zur Lichtreaktion',
		url: 'https://dev.edufeed.org/naddr1abc',
		sourcePage: 'https://oer-repository.switch.ch/material/4711',
		learningResourceType: ['Diagramm'],
		educationalLevel: ['Sekundarstufe II'],
		about: ['Biologie'],
		creator: [{ name: 'Roger Kuhn' }],
		publisher: [{ name: 'switch' }],
		license: { id: 'https://creativecommons.org/licenses/by-sa/4.0/' },
	};

	describe('search', () => {
		it('should always ask the oersi relay as well', async () => {
			const { service, mcpClientService } = setup({ resources: [] });

			await service.search('Fotosynthese');

			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({
					query: 'Fotosynthese',
					relays: ['wss://amb-relay.edufeed.org', 'wss://oersi.edufeed.org'],
				})
			);
		});

		it('should never ask for more than ten results', async () => {
			const { service, mcpClientService } = setup({ resources: [] });

			await service.search('Fotosynthese', 50);

			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({ limit: 10 })
			);
		});

		it('should map a result to what a teacher needs to judge it', async () => {
			const { service } = setup({ resources: [resource] });

			const results = await service.search('Fotosynthese');

			expect(results).toEqual([
				{
					title: 'Z-Schema Fotosynthese',
					description: 'Ein Diagramm zur Lichtreaktion',
					// the source page is the material itself, the url only points at the relay viewer
					url: 'https://oer-repository.switch.ch/material/4711',
					provider: 'switch',
					license: 'CC BY-SA',
					resourceType: 'Diagramm',
					educationalLevel: 'Sekundarstufe II',
					subjects: ['Biologie'],
				},
			]);
		});

		it('should fall back to the relay url when there is no source page', async () => {
			const { service } = setup({ resources: [{ ...resource, sourcePage: undefined }] });

			const [result] = await service.search('Fotosynthese');

			expect(result.url).toBe('https://dev.edufeed.org/naddr1abc');
		});

		it.each([
			{ id: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'CC0' },
			{ id: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY' },
			{ id: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', label: 'CC BY-NC-ND' },
		])('should name the licence $label', async ({ id, label }) => {
			const { service } = setup({ resources: [{ ...resource, license: { id } }] });

			const [result] = await service.search('Fotosynthese');

			expect(result.license).toBe(label);
		});

		it('should drop a result without a usable address', async () => {
			const { service } = setup({
				resources: [{ ...resource, sourcePage: 'http://unsicher.example', url: undefined }, { name: 'ohne url' }],
			});

			const results = await service.search('Fotosynthese');

			expect(results).toEqual([]);
		});

		it('should cut the result down to what was asked for', async () => {
			const { service } = setup({ resources: Array.from({ length: 12 }, () => resource) });

			const results = await service.search('Fotosynthese', 4);

			expect(results).toHaveLength(4);
		});

		it('should survive an answer that carries no resources', async () => {
			const { service } = setup(undefined);

			await expect(service.search('Fotosynthese')).resolves.toEqual([]);
		});
	});
});
