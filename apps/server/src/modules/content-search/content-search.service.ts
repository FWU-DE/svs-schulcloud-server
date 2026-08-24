import { Inject, Injectable } from '@nestjs/common';
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
 * Searches open educational resources through the amb relay, a public mcp server. Both relays are
 * asked on every query: the amb relay is the default corpus, oersi has to be named explicitly or
 * the remote server leaves it out.
 */
@Injectable()
export class ContentSearchService {
	constructor(
		@Inject(CONTENT_SEARCH_CONFIG_TOKEN) private readonly config: ContentSearchConfig,
		private readonly mcpClientService: McpClientService
	) {}

	public async search(query: string, limit = 6, language = 'de'): Promise<ContentSearchResult[]> {
		const wanted = Math.min(limit, MAX_LIMIT);
		const answer = (await this.mcpClientService.callTool('search_resources', {
			query,
			limit: wanted,
			language,
			relays: this.relays(),
		})) as { resources?: AmbResource[] } | undefined;

		// the remote server applies the limit per relay, so asking two relays returns twice as much
		return (answer?.resources ?? [])
			.map((resource) => this.toResult(resource))
			.filter((result) => result !== undefined)
			.slice(0, wanted);
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
			resourceType: resource.learningResourceType?.[0] ?? '',
			educationalLevel: resource.educationalLevel?.[0] ?? '',
			subjects: resource.about ?? [],
		};
	}

	private licenseLabel(licenseId?: string): string {
		if (licenseId === undefined) return '';

		const license = LICENSES.find((candidate) => licenseId.includes(candidate.pattern));

		return license?.label ?? licenseId;
	}
}
