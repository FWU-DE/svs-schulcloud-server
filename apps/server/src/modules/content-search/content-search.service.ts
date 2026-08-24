import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CONTENT_SEARCH_CONFIG_TOKEN, ContentSearchConfig } from './content-search.config';
import { McpClientService } from './mcp-client.service';

export interface ContentSearchResult {
	title: string;
	description: string;
	url: string;
	provider: string;
	license: string;
	resourceType: string;
	educationalLevel: string;
	subjects: string[];
}

interface AmbResource {
	id?: string;
	name?: string;
	description?: string;
	url?: string;
	sourcePage?: string;
	learningResourceType?: string[];
	educationalLevel?: string[];
	about?: string[];
	creator?: { name?: string }[];
	publisher?: { name?: string }[];
	license?: { id?: string };
	inLanguage?: string[];
}

const MAX_DESCRIPTION_LENGTH = 400;

/**
 * Part of the records name the kind of material as a term of the kim vocabulary rather than as a
 * word, and a teacher should not have to read a uri to see that something is a worksheet.
 */
const RESOURCE_TYPES: Record<string, string> = {
	application: 'Anwendung',
	assessment: 'Lernkontrolle',
	audio: 'Audio',
	case_study: 'Fallstudie',
	course: 'Kurs',
	data: 'Daten',
	diagram: 'Diagramm',
	drill_and_practice: 'Übung',
	educational_game: 'Lernspiel',
	experiment: 'Experiment',
	image: 'Bild',
	index: 'Nachschlagewerk',
	lesson_plan: 'Unterrichtsplanung',
	map: 'Karte',
	portal: 'Portal',
	questionnaire: 'Fragebogen',
	script: 'Skript',
	sheet_music: 'Noten',
	simulation: 'Simulation',
	slide: 'Folien',
	software: 'Software',
	text: 'Text',
	textbook: 'Lehrbuch',
	video: 'Video',
	web_page: 'Webseite',
	worksheet: 'Arbeitsblatt',
	other: 'Sonstiges',
};
const MAX_LIMIT = 10;

/** the licence is a url in the metadata, teachers want to read the short name */
const LICENSES: { pattern: string; label: string }[] = [
	{ pattern: '/publicdomain/zero', label: 'CC0' },
	{ pattern: '/licenses/by-nc-nd', label: 'CC BY-NC-ND' },
	{ pattern: '/licenses/by-nc-sa', label: 'CC BY-NC-SA' },
	{ pattern: '/licenses/by-nd', label: 'CC BY-ND' },
	{ pattern: '/licenses/by-nc', label: 'CC BY-NC' },
	{ pattern: '/licenses/by-sa', label: 'CC BY-SA' },
	{ pattern: '/licenses/by', label: 'CC BY' },
];

/**
 * Searches open educational resources through the amb relay, a public mcp server. Every configured
 * relay is asked on every query, each in its own call: the amb relay is the default corpus, oersi
 * has to be named explicitly or the remote server leaves it out - and for school subjects oersi is
 * usually the one carrying the material.
 */
@Injectable()
export class ContentSearchService {
	constructor(
		@Inject(CONTENT_SEARCH_CONFIG_TOKEN) private readonly config: ContentSearchConfig,
		private readonly mcpClientService: McpClientService
	) {}

	public async search(query: string, limit = 6, language = 'de'): Promise<ContentSearchResult[]> {
		const wanted = Math.min(limit, MAX_LIMIT);
		const relays = this.relays();

		// one call per relay: the remote merges relay after relay, so a single call would bury the
		// results of the second relay below a full page of the first. Asking separately also keeps
		// one unreachable relay from taking down the whole search.
		const answers = await Promise.allSettled(relays.map((relay) => this.searchRelay(query, wanted, language, relay)));

		const reachable = answers.filter((answer) => answer.status === 'fulfilled');
		if (reachable.length === 0) {
			throw new InternalServerErrorException('The content search could not reach any relay');
		}

		return this.merge(
			reachable.map((answer) => answer.value),
			wanted
		);
	}

	private async searchRelay(query: string, limit: number, language: string, relay: string): Promise<AmbResource[]> {
		const answer = (await this.mcpClientService.callTool('search_resources', {
			query,
			limit,
			language,
			relays: [relay],
		})) as { resources?: AmbResource[] } | undefined;

		return answer?.resources ?? [];
	}

	/** takes the best hit of every relay in turn, so each corpus reaches the teacher */
	private merge(perRelay: AmbResource[][], wanted: number): ContentSearchResult[] {
		const results: ContentSearchResult[] = [];
		const seen = new Set<string>();
		const deepest = perRelay.reduce((depth, resources) => Math.max(depth, resources.length), 0);

		for (let rank = 0; rank < deepest && results.length < wanted; rank += 1) {
			for (const resources of perRelay) {
				if (results.length >= wanted) break;

				const resource = resources[rank];
				const result = resource === undefined ? undefined : this.toResult(resource);
				if (resource === undefined || result === undefined) continue;

				// the same material can sit on both relays
				const identity = resource.id ?? result.url;
				if (seen.has(identity)) continue;

				seen.add(identity);
				results.push(result);
			}
		}

		return results;
	}

	public relays(): string[] {
		return this.config.relays
			.split(',')
			.map((relay) => relay.trim())
			.filter((relay) => relay.length > 0);
	}

	private toResult(resource: AmbResource): ContentSearchResult | undefined {
		// the source page is where the material really lives, the url points at the relay viewer
		const url = resource.sourcePage ?? resource.url;
		if (typeof url !== 'string' || !url.startsWith('https://') || typeof resource.name !== 'string') {
			return undefined;
		}

		return {
			title: resource.name,
			description: (resource.description ?? '').slice(0, MAX_DESCRIPTION_LENGTH),
			url,
			provider: resource.publisher?.[0]?.name ?? resource.creator?.[0]?.name ?? '',
			license: this.licenseLabel(resource.license?.id),
			resourceType: this.resourceTypeLabel(resource.learningResourceType?.[0]),
			educationalLevel: resource.educationalLevel?.[0] ?? '',
			subjects: resource.about ?? [],
		};
	}

	private resourceTypeLabel(resourceType?: string): string {
		if (resourceType === undefined) return '';
		if (!resourceType.startsWith('http')) return resourceType;

		const term = resourceType.split('/').pop() ?? '';

		return RESOURCE_TYPES[term] ?? term.replace(/_/g, ' ');
	}

	private licenseLabel(licenseId?: string): string {
		if (licenseId === undefined) return '';

		const license = LICENSES.find((candidate) => licenseId.includes(candidate.pattern));

		return license?.label ?? licenseId;
	}
}
