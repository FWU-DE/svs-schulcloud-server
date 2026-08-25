import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ContentSearchConfig } from './content-search.config';
import { ContentSearchService } from './content-search.service';
import { McpClientService } from './mcp-client.service';

describe('ContentSearchService', () => {
	const AMB = 'wss://amb-relay.edufeed.org';
	const OERSI = 'wss://oersi.edufeed.org';
	const SODIX = 'wss://sodix.edufeed.org';

	const resource = (overrides: Record<string, unknown> = {}) => {
		return {
			id: 'https://oer-repository.switch.ch/material/4711',
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
			...overrides,
		};
	};

	/** answers per relay, in the order the relays are configured */
	const setup = (...perRelay: (unknown[] | Error)[]) => {
		const relays = [AMB, OERSI, SODIX].slice(0, Math.max(perRelay.length, 2));

		const config = new ContentSearchConfig();
		config.relays = relays.join(',');

		const mcpClientService: DeepMocked<McpClientService> = createMock<McpClientService>();
		mcpClientService.callTool.mockImplementation((_name, args) => {
			const relay = (args as { relays: string[] }).relays[0];
			const answer = perRelay[relays.indexOf(relay)];

			return answer instanceof Error ? Promise.reject(answer) : Promise.resolve({ resources: answer ?? [] });
		});

		return { service: new ContentSearchService(config, mcpClientService), mcpClientService };
	};

	const named = (name: string) => resource({ id: `urn:${name}`, name });

	describe('search', () => {
		it('should ask every relay on its own', async () => {
			const { service, mcpClientService } = setup([], [], []);

			await service.search('Fotosynthese');

			expect(mcpClientService.callTool).toHaveBeenCalledTimes(3);
			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({ query: 'Fotosynthese', relays: [AMB] })
			);
			// oersi and sodix are extra corpora the remote leaves out unless they are named
			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({ query: 'Fotosynthese', relays: [OERSI] })
			);
			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({ query: 'Fotosynthese', relays: [SODIX] })
			);
		});

		it('should never ask for more than ten results', async () => {
			const { service, mcpClientService } = setup([], []);

			await service.search('Fotosynthese', 50);

			expect(mcpClientService.callTool).toHaveBeenCalledWith(
				'search_resources',
				expect.objectContaining({ limit: 10 })
			);
		});

		it('should map a result to what a teacher needs to judge it', async () => {
			const { service } = setup([resource()], []);

			const { results } = await service.search('Fotosynthese');

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
			const { service } = setup([resource({ sourcePage: undefined })], []);

			const [result] = (await service.search('Fotosynthese')).results;

			expect(result.url).toBe('https://dev.edufeed.org/naddr1abc');
		});

		it.each([
			{ id: 'https://creativecommons.org/publicdomain/zero/1.0/', label: 'CC0' },
			{ id: 'https://creativecommons.org/licenses/by/4.0/', label: 'CC BY' },
			{ id: 'https://creativecommons.org/licenses/by-nc-nd/4.0/', label: 'CC BY-NC-ND' },
			// not everything on the relays is creative commons
			{ id: 'https://www.apache.org/licenses/LICENSE-2.0', label: 'Apache 2.0' },
		])('should name the licence $label', async ({ id, label }) => {
			const { service } = setup([resource({ license: { id } })], []);

			const [result] = (await service.search('Fotosynthese')).results;

			expect(result.license).toBe(label);
		});

		it.each([
			{ value: 'https://w3id.org/kim/hcrt/worksheet', label: 'Arbeitsblatt' },
			{ value: 'https://w3id.org/kim/hcrt/drill_and_practice', label: 'Übung' },
			// an unknown term is still better read as words than as a uri
			{ value: 'https://w3id.org/kim/hcrt/team_building', label: 'team building' },
			{ value: 'Diagramm', label: 'Diagramm' },
		])('should name the kind of material $label', async ({ value, label }) => {
			const { service } = setup([resource({ learningResourceType: [value] })], []);

			const [result] = (await service.search('Fotosynthese')).results;

			expect(result.resourceType).toBe(label);
		});

		it('should drop a result without a usable address', async () => {
			const { service } = setup(
				[resource({ sourcePage: 'http://unsicher.example', url: undefined }), { name: 'ohne url' }],
				[]
			);

			const { results } = await service.search('Fotosynthese');

			expect(results).toEqual([]);
		});

		describe('when several relays answer', () => {
			it('should give every relay a share instead of filling up from the first', async () => {
				const { service } = setup(
					[named('amb 1'), named('amb 2'), named('amb 3'), named('amb 4')],
					[named('oersi 1'), named('oersi 2'), named('oersi 3'), named('oersi 4')],
					[named('sodix 1'), named('sodix 2'), named('sodix 3'), named('sodix 4')]
				);

				const { results } = await service.search('Mathematik', 6);

				expect(results.map((result) => result.title)).toEqual([
					'amb 1',
					'oersi 1',
					'sodix 1',
					'amb 2',
					'oersi 2',
					'sodix 2',
				]);
			});

			it('should fill up from the other relay when one has little to offer', async () => {
				const { service } = setup([named('amb 1')], [named('oersi 1'), named('oersi 2'), named('oersi 3')]);

				const { results } = await service.search('Fotosynthese', 4);

				expect(results.map((result) => result.title)).toEqual(['amb 1', 'oersi 1', 'oersi 2', 'oersi 3']);
			});

			it('should show material that sits on both relays only once', async () => {
				const { service } = setup([named('geteiltes material')], [named('geteiltes material'), named('nur oersi')]);

				const { results } = await service.search('Fotosynthese', 4);

				expect(results.map((result) => result.title)).toEqual(['geteiltes material', 'nur oersi']);
			});

			it('should cut the result down to what was asked for', async () => {
				const { service } = setup(
					Array.from({ length: 6 }, (_, index) => named(`amb ${index}`)),
					Array.from({ length: 6 }, (_, index) => named(`oersi ${index}`))
				);

				const { results } = await service.search('Fotosynthese', 4);

				expect(results).toHaveLength(4);
			});
		});

		describe('when the question is a sentence', () => {
			it('should ask the relays for the topic instead of the whole sentence', async () => {
				const { service, mcpClientService } = setup([], [], []);

				const { query } = await service.search('Fotosynthese Sekundarstufe I');

				expect(query).toBe('Fotosynthese');
				expect(mcpClientService.callTool).toHaveBeenCalledWith(
					'search_resources',
					expect.objectContaining({ query: 'Fotosynthese' })
				);
			});

			it('should keep the spelling of the word it picked', async () => {
				const { service } = setup([], [], []);

				const { query } = await service.search('Würfel Wahrscheinlichkeit Klasse 8');

				expect(query).toBe('Würfel');
			});

			it('should fall back to the question when no word carries a topic', async () => {
				const { service } = setup([], [], []);

				const { query } = await service.search('Ziele der Stunde');

				expect(query).toBe('Ziele der Stunde');
			});

			it('should put the results that cover more of the question first', async () => {
				const { service } = setup(
					[
						resource({ id: 'a', name: 'Zellteilung im Überblick', description: 'Ein Video' }),
						resource({ id: 'b', name: 'Zellteilung: Mitose als Arbeitsblatt', description: 'Zum Ausdrucken' }),
					],
					[],
					[]
				);

				const { results } = await service.search('Zellteilung Mitose Arbeitsblatt');

				expect(results.map((result) => result.title)).toEqual([
					'Zellteilung: Mitose als Arbeitsblatt',
					'Zellteilung im Überblick',
				]);
			});

			it('should leave the order of equally fitting results to the relays', async () => {
				const { service } = setup(
					[resource({ id: 'a', name: 'Zellteilung eins' })],
					[resource({ id: 'b', name: 'Zellteilung zwei' })],
					[resource({ id: 'c', name: 'Zellteilung drei' })]
				);

				const { results } = await service.search('Zellteilung Mitose');

				expect(results.map((result) => result.title)).toEqual([
					'Zellteilung eins',
					'Zellteilung zwei',
					'Zellteilung drei',
				]);
			});
		});

		describe('when a relay cannot be reached', () => {
			it('should still return what the other relay found', async () => {
				const { service } = setup(new Error('relay is down'), [named('oersi 1')]);

				const { results } = await service.search('Fotosynthese');

				expect(results.map((result) => result.title)).toEqual(['oersi 1']);
			});

			it('should fail when no relay can be reached', async () => {
				const { service } = setup(new Error('relay is down'), new Error('relay is down'));

				await expect(service.search('Fotosynthese')).rejects.toThrow('could not reach any relay');
			});
		});

		it('should survive an answer that carries no resources', async () => {
			const { service } = setup(undefined as unknown as unknown[], undefined as unknown as unknown[]);

			await expect(service.search('Fotosynthese')).resolves.toEqual({ query: 'Fotosynthese', results: [] });
		});
	});
});
