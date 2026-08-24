import { Colors } from '@modules/board';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ROOM_AI_CONFIG_TOKEN, RoomAiConfig } from '../../room.config';

export type RoomAiBoardLayout = 'columns' | 'list';

export type RoomAiElement =
	| { kind: 'text'; text: string }
	| { kind: 'link'; title: string; url: string }
	| { kind: 'boardLink'; title: string; boardIndex: number }
	| { kind: 'folder'; title: string }
	| { kind: 'drawing' }
	| { kind: 'collaborative' }
	| { kind: 'videoConference'; title: string };

export type RoomAiTemplateItem =
	| { type: 'roomName'; name: string }
	| { type: 'board'; title: string; layout: RoomAiBoardLayout }
	| { type: 'column'; title: string }
	| { type: 'card'; title: string; color?: Colors; elements: RoomAiElement[] };

const MAX_TITLE_LENGTH = 100;
const MAX_TEXT_LENGTH = 2000;
const MAX_BOARDS = 4;
const MAX_CARDS_PER_COLUMN = 8;
const MAX_ELEMENTS_PER_CARD = 4;
const DEFAULT_MAX_COLUMNS = 6;

const CARD_COLORS = new Set<string>(Object.values(Colors));

const SYSTEM_PROMPT = [
	'You design the structure of a room in a school learning platform for a teacher.',
	'A room holds boards, a board holds columns, a column holds cards and a card holds content elements.',
	'Answer as newline delimited json, one object per line and nothing else - no prose, no markdown, no code fences.',
	'The first line is {"type":"roomName","name":"..."}.',
	'Then repeat, in reading order: {"type":"board","title":"...","layout":"columns"|"list"},',
	'{"type":"column","title":"..."} and {"type":"card","title":"...","color":"...","elements":[...]}.',
	'A column belongs to the board above it, a card to the column above it.',
	'A card carries at most four elements, each one of:',
	'{"kind":"text","text":"<p>...</p>"} - simple html, only <p>, <strong>, <ul>, <ol> and <li>, at most three short sentences;',
	'{"kind":"link","title":"...","url":"https://..."} - a reference to a stable, well known public source;',
	'only use domains you are sure exist and prefer their landing or article page over a deep link;',
	'{"kind":"boardLink","title":"...","board":N} - a cross reference to the Nth board of this very room, counting from 1;',
	'{"kind":"folder","title":"..."} - a folder for files the teacher will upload;',
	'{"kind":"drawing"} - an empty whiteboard for sketches, mind maps and brainstorming;',
	'{"kind":"collaborative"} - an empty shared text document for group work;',
	'{"kind":"videoConference","title":"..."} - only where a meeting really belongs.',
	'Colour cards to mark what they are for: use at most three colours and keep their meaning consistent,',
	'for example red for tasks, blue for material and green for results. Allowed colours are',
	'red, orange, amber, yellow, green, teal, blue, lightBlue, purple, grey and blueGrey.',
	'Give the room two or three boards when the topic has phases, and cross-link them with boardLink.',
	'Write placeholders where the teacher has to fill in facts you cannot know, never invent dates, names or grades.',
	'Answer in the language the teacher used.',
].join(' ');

/**
 * Asks a chat completion api for a room structure and yields it item by item, so that the client
 * can show the structure growing while it is generated.
 */
@Injectable()
export class RoomAiTemplateService {
	constructor(@Inject(ROOM_AI_CONFIG_TOKEN) private readonly config: RoomAiConfig) {}

	public isConfigured(): boolean {
		return this.config.aiApiKey.length > 0;
	}

	public async *generate(prompt: string, maxColumns = DEFAULT_MAX_COLUMNS): AsyncGenerator<RoomAiTemplateItem> {
		const response = await this.requestCompletion(prompt, maxColumns);
		const counter = { boards: 0, columns: 0, cardsOfColumn: 0 };

		for await (const line of this.readLines(response)) {
			const item = this.parseItem(line);
			if (item === undefined) continue;
			if (!this.isWithinLimits(item, counter, maxColumns)) continue;

			if (item.type === 'card') {
				item.elements = await this.usableElements(item.elements);
			}

			yield item;
		}
	}

	private async requestCompletion(prompt: string, maxColumns: number): Promise<Response> {
		const response = await fetch(this.config.aiApiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.authHeader(),
			},
			body: JSON.stringify({
				model: this.config.aiModel,
				stream: true,
				messages: [
					{ role: 'system', content: `${SYSTEM_PROMPT} Use at most ${maxColumns} columns per board.` },
					{ role: 'user', content: prompt },
				],
			}),
		});

		if (!response.ok || response.body === null) {
			// the body may carry the reason, but it can also carry the prompt back - keep it out of the logs
			throw new InternalServerErrorException(`The ai service answered with status ${response.status}`);
		}

		return response;
	}

	private authHeader(): Record<string, string> {
		return this.config.aiApiStyle === 'azure'
			? { 'api-key': this.config.aiApiKey }
			: { Authorization: `Bearer ${this.config.aiApiKey}` };
	}

	/** turns the chunked server sent events of the completion api back into whole json lines */
	private async *readLines(response: Response): AsyncGenerator<string> {
		const decoder = new TextDecoder();
		let events = '';
		let content = '';

		for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
			events += decoder.decode(chunk, { stream: true });

			const eventLines = events.split('\n');
			events = eventLines.pop() ?? '';

			for (const eventLine of eventLines) {
				content += this.contentOf(eventLine);

				const contentLines = content.split('\n');
				content = contentLines.pop() ?? '';

				for (const contentLine of contentLines) {
					if (contentLine.trim().length > 0) yield contentLine;
				}
			}
		}

		if (content.trim().length > 0) yield content;
	}

	private contentOf(eventLine: string): string {
		if (!eventLine.startsWith('data:')) return '';

		const payload = eventLine.slice('data:'.length).trim();
		if (payload.length === 0 || payload === '[DONE]') return '';

		try {
			const event = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
			return event.choices?.[0]?.delta?.content ?? '';
		} catch {
			return '';
		}
	}

	private parseItem(line: string): RoomAiTemplateItem | undefined {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line.trim());
		} catch {
			return undefined;
		}

		const item = parsed as {
			type?: string;
			name?: unknown;
			title?: unknown;
			layout?: unknown;
			color?: unknown;
			elements?: unknown;
		};
		const title = this.shorten(item.type === 'roomName' ? item.name : item.title, MAX_TITLE_LENGTH);
		if (title === undefined) return undefined;

		if (item.type === 'roomName') return { type: 'roomName', name: title };
		if (item.type === 'board') {
			return { type: 'board', title, layout: item.layout === 'list' ? 'list' : 'columns' };
		}
		if (item.type === 'column') return { type: 'column', title };
		if (item.type === 'card') {
			return { type: 'card', title, color: this.cardColor(item.color), elements: this.parseElements(item.elements) };
		}

		return undefined;
	}

	private cardColor(color: unknown): Colors | undefined {
		return typeof color === 'string' && CARD_COLORS.has(color) ? (color as Colors) : undefined;
	}

	private parseElements(elements: unknown): RoomAiElement[] {
		if (!Array.isArray(elements)) return [];

		return elements
			.slice(0, MAX_ELEMENTS_PER_CARD)
			.map((element) => this.parseElement(element))
			.filter((element): element is RoomAiElement => element !== undefined);
	}

	private parseElement(element: unknown): RoomAiElement | undefined {
		const candidate = element as { kind?: string; text?: unknown; title?: unknown; url?: unknown; board?: unknown };
		const title = this.shorten(candidate.title, MAX_TITLE_LENGTH);

		switch (candidate.kind) {
			case 'text': {
				const text = this.shorten(candidate.text, MAX_TEXT_LENGTH);
				return text === undefined ? undefined : { kind: 'text', text };
			}
			case 'link': {
				const url = this.publicUrl(candidate.url);
				return title === undefined || url === undefined ? undefined : { kind: 'link', title, url };
			}
			case 'boardLink': {
				const board = Number(candidate.board);
				if (title === undefined || !Number.isInteger(board) || board < 1 || board > MAX_BOARDS) return undefined;

				// the model counts boards from 1, the client addresses them from 0
				return { kind: 'boardLink', title, boardIndex: board - 1 };
			}
			case 'folder':
				return title === undefined ? undefined : { kind: 'folder', title };
			case 'drawing':
				return { kind: 'drawing' };
			case 'collaborative':
				return { kind: 'collaborative' };
			case 'videoConference':
				return title === undefined ? undefined : { kind: 'videoConference', title };
			default:
				return undefined;
		}
	}

	/** only public https addresses, a made up scheme or an internal host has no place on a card */
	private publicUrl(url: unknown): string | undefined {
		if (typeof url !== 'string') return undefined;

		try {
			const parsed = new URL(url.trim());
			const isPublicHost = parsed.hostname.includes('.') && !parsed.hostname.endsWith('.local');
			const hasNoCredentials = parsed.username === '' && parsed.password === '';

			return parsed.protocol === 'https:' && isPublicHost && hasNoCredentials ? parsed.toString() : undefined;
		} catch {
			return undefined;
		}
	}

	/** a link the model made up is worse than no link at all, so every reference is probed once */
	private async usableElements(elements: RoomAiElement[]): Promise<RoomAiElement[]> {
		if (!this.config.aiCheckLinks) return elements;

		const checked = await Promise.all(
			elements.map(async (element) => {
				if (element.kind !== 'link') return element;

				return (await this.doesResolve(element.url)) ? element : undefined;
			})
		);

		return checked.filter((element): element is RoomAiElement => element !== undefined);
	}

	private async doesResolve(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, {
				method: 'HEAD',
				redirect: 'follow',
				signal: AbortSignal.timeout(this.config.aiLinkCheckTimeoutMs),
			});

			// a site that dislikes HEAD still tells us that it exists
			return response.status !== 404 && response.status !== 410;
		} catch {
			return false;
		}
	}

	/** a model that keeps going must not be able to create an endless room */
	private isWithinLimits(
		item: RoomAiTemplateItem,
		counter: { boards: number; columns: number; cardsOfColumn: number },
		maxColumns: number
	): boolean {
		if (item.type === 'board') {
			counter.boards += 1;
			counter.columns = 0;
			counter.cardsOfColumn = 0;
			return counter.boards <= MAX_BOARDS;
		}
		if (counter.boards === 0 || counter.boards > MAX_BOARDS) return item.type === 'roomName';
		if (item.type === 'column') {
			counter.columns += 1;
			counter.cardsOfColumn = 0;
			return counter.columns <= maxColumns;
		}
		if (item.type === 'card') {
			if (counter.columns === 0 || counter.columns > maxColumns) return false;
			counter.cardsOfColumn += 1;
			return counter.cardsOfColumn <= MAX_CARDS_PER_COLUMN;
		}

		return true;
	}

	private shorten(value: unknown, maxLength: number): string | undefined {
		if (typeof value !== 'string') return undefined;

		const trimmed = value.trim();
		return trimmed.length === 0 ? undefined : trimmed.slice(0, maxLength);
	}
}
