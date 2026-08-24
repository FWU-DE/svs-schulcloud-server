import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ROOM_CONFIG_TOKEN, RoomConfig } from '../../room.config';

export type RoomAiBoardLayout = 'columns' | 'list';

export type RoomAiTemplateItem =
	| { type: 'roomName'; name: string }
	| { type: 'board'; title: string; layout: RoomAiBoardLayout }
	| { type: 'column'; title: string }
	| { type: 'card'; title: string; text: string };

const MAX_TITLE_LENGTH = 100;
const MAX_TEXT_LENGTH = 2000;
const MAX_BOARDS = 3;
const MAX_CARDS_PER_COLUMN = 8;
const DEFAULT_MAX_COLUMNS = 6;

const SYSTEM_PROMPT = [
	'You design the structure of a room in a school learning platform for a teacher.',
	'A room holds boards, a board holds columns and a column holds cards. A card can carry one short rich text.',
	'Answer as newline delimited json, one object per line and nothing else - no prose, no markdown, no code fences.',
	'The first line is {"type":"roomName","name":"..."}.',
	'Then repeat, in reading order: {"type":"board","title":"...","layout":"columns"|"list"},',
	'{"type":"column","title":"..."} and {"type":"card","title":"...","text":"<p>...</p>"}.',
	'A column belongs to the board above it, a card to the column above it.',
	'The text of a card is simple html, only <p>, <strong>, <ul>, <ol> and <li> are allowed, at most three short sentences.',
	'Write placeholders where the teacher has to fill in facts you cannot know, never invent dates, names or grades.',
	'Answer in the language the teacher used.',
].join(' ');

/**
 * Asks a chat completion api for a room structure and yields it item by item, so that the client
 * can show the structure growing while it is generated.
 */
@Injectable()
export class RoomAiTemplateService {
	constructor(@Inject(ROOM_CONFIG_TOKEN) private readonly config: RoomConfig) {}

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

			yield item;
		}
	}

	private async requestCompletion(prompt: string, maxColumns: number): Promise<Response> {
		const response = await fetch(this.config.aiApiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.config.aiApiKey}`,
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

		const item = parsed as { type?: string; name?: unknown; title?: unknown; layout?: unknown; text?: unknown };
		const title = this.shorten(item.type === 'roomName' ? item.name : item.title, MAX_TITLE_LENGTH);
		if (title === undefined) return undefined;

		if (item.type === 'roomName') return { type: 'roomName', name: title };
		if (item.type === 'board') {
			return { type: 'board', title, layout: item.layout === 'list' ? 'list' : 'columns' };
		}
		if (item.type === 'column') return { type: 'column', title };
		if (item.type === 'card') {
			return { type: 'card', title, text: this.shorten(item.text, MAX_TEXT_LENGTH) ?? '' };
		}

		return undefined;
	}

	private shorten(value: unknown, maxLength: number): string | undefined {
		if (typeof value !== 'string') return undefined;

		const trimmed = value.trim();
		return trimmed.length === 0 ? undefined : trimmed.slice(0, maxLength);
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
}
