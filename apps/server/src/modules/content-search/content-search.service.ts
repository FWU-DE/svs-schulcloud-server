import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CONTENT_SEARCH_CONFIG_TOKEN, ContentSearchConfig } from './content-search.config';
import { McpClientService } from './mcp-client.service';

export interface ContentSearchAnswer {
	/** what was actually sent to the relays, which is rarely the whole sentence a teacher typed */
	query: string;
	results: ContentSearchResult[];
}

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
const MIN_TERM_LENGTH = 4;

/**
 * Words that say nothing about the topic. Besides the usual articles and prepositions these are
 * the ones a card title carries out of habit - a class or a school level narrows nothing in a
 * full text search, it only drags the results towards whatever else mentions "Klasse".
 */
const STOPWORDS = new Set([
	'aber',
	'aus',
	'bei',
	'das',
	'dem',
	'den',
	'der',
	'des',
	'die',
	'ein',
	'eine',
	'einer',
	'fuer',
	'für',
	'ihre',
	'mit',
	'nach',
	'oder',
	'sich',
	'und',
	'vom',
	'von',
	'zum',
	'zur',
	'über',
	'einheit',
	'einstieg',
	'jahrgang',
	'klasse',
	'kurs',
	'lernziele',
	'material',
	'primarstufe',
	'schuljahr',
	'sekundarbereich',
	'sekundarstufe',
	'stunde',
	'stufe',
	'thema',
	'themen',
	'unterricht',
	'unterrichtsreihe',
	'ziel',
	'ziele',
]);

/** the licence is a url in the metadata, teachers want to read the short name */
const LICENSES: { pattern: string; label: string }[] = [
	{ pattern: '/publicdomain/zero', label: 'CC0' },
	{ pattern: '/licenses/by-nc-nd', label: 'CC BY-NC-ND' },
	{ pattern: '/licenses/by-nc-sa', label: 'CC BY-NC-SA' },
	{ pattern: '/licenses/by-nd', label: 'CC BY-ND' },
	{ pattern: '/licenses/by-nc', label: 'CC BY-NC' },
	{ pattern: '/licenses/by-sa', label: 'CC BY-SA' },
	{ pattern: '/licenses/by', label: 'CC BY' },
	{ pattern: '/publicdomain/mark', label: 'Public Domain' },
	{ pattern: 'apache.org/licenses/LICENSE-2.0', label: 'Apache 2.0' },
	{ pattern: 'opensource.org/licenses/MIT', label: 'MIT' },
	{ pattern: 'gnu.org/licenses/gpl', label: 'GPL' },
	{ pattern: 'opendatacommons.org/licenses/odbl', label: 'ODbL' },
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

	public async search(query: string, limit = 6, language = 'de'): Promise<ContentSearchAnswer> {
		const wanted = Math.min(limit, MAX_LIMIT);
		const relays = this.relays();

		// the full text search of the relays falls apart on a sentence: "Fotosynthese Sekundarstufe I"
		// answers with maths exams. Asking for the topic alone and sorting the answers here against
		// the whole question lifts the share of fitting results from roughly a tenth to about half.
		const terms = this.terms(query);
		const searched = terms[0]?.original ?? query;

		// one call per relay: the remote merges relay after relay, so a single call would bury the
		// results of the second relay below a full page of the first. Asking separately also keeps
		// one unreachable relay from taking down the whole search.
		const answers = await Promise.allSettled(
			relays.map((relay) => this.searchRelay(searched, wanted, language, relay))
		);

		const reachable = answers.filter((answer) => answer.status === 'fulfilled');
		if (reachable.length === 0) {
			throw new InternalServerErrorException('The content search could not reach any relay');
		}

		const merged = this.merge(reachable.map((answer) => answer.value));

		return { query: searched, results: this.rank(merged, terms).slice(0, wanted) };
	}

	/** the words of the question that carry a topic, in the order they were written */
	private terms(query: string): { original: string; normalized: string }[] {
		return query
			.split(/[^\p{L}\p{N}]+/u)
			.filter((word) => word.length >= MIN_TERM_LENGTH && !/^\d+$/.test(word))
			.map((word) => {
				return { original: word, normalized: this.fold(word) };
			})
			.filter((term) => !STOPWORDS.has(term.normalized) && !STOPWORDS.has(term.original.toLowerCase()));
	}

	/** lower case and without accents, so a result spelled "Wuerfel" still answers to "Würfel" */
	private fold(word: string): string {
		return word
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/gu, '');
	}

	/**
	 * Sorts by how much of the original question a result covers. The sort is stable, so results
	 * that cover the same amount keep the order the relays were taken in and no relay loses its
	 * share to the ranking.
	 */
	private rank(
		results: ContentSearchResult[],
		terms: { original: string; normalized: string }[]
	): ContentSearchResult[] {
		if (terms.length < 2) return results;

		const covered = (result: ContentSearchResult): number => {
			const haystack = this.fold(`${result.title} ${result.description} ${result.subjects.join(' ')}`);

			// a prefix is enough: the plural, the compound and the inflected form all start the same
			return terms.filter((term) => haystack.includes(term.normalized.slice(0, MIN_TERM_LENGTH + 1))).length;
		};

		return [...results].sort((left, right) => covered(right) - covered(left));
	}

	/**
	 * The remote server also offers search_content, which ranks across all content kinds at once.
	 * Measured against search_resources over ten school topics it found no better material (38 of
	 * 55 hits on topic against 37 of 59), the other kinds are empty for german school subjects -
	 * seven broad queries turned up a single wiki entry, and that one a test record - and its
	 * results carry no licence, which would cost one get_resource call per hit to fetch. So this
	 * stays on search_resources.
	 *
	 * Its metadata filters (subjectLabel, educationalLevelLabel, resourceTypeLabel) are left alone
	 * for the same reason. They match the label as an exact string, so "Sekundarstufe I" silently
	 * finds nothing where "Sekundarbereich I" finds something, and what they do return often
	 * carries a different value than the one asked for - 9 of 24 for "Sekundarbereich I", 1 of 9
	 * for the subject "Deutsch", with master level material among the school results. Added to a
	 * query that already works they change nothing, and where the metadata is thin they empty the
	 * list: "Balladen" plus the subject "Deutsch" returns zero.
	 */
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
	private merge(perRelay: AmbResource[][]): ContentSearchResult[] {
		const results: ContentSearchResult[] = [];
		const seen = new Set<string>();
		const deepest = perRelay.reduce((depth, resources) => Math.max(depth, resources.length), 0);

		for (let rank = 0; rank < deepest; rank += 1) {
			for (const resources of perRelay) {
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
