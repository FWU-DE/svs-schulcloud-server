import { AiSuggestionService } from '@modules/ai-suggestion';
import { Injectable } from '@nestjs/common';
import { AnyBoardNode, Card, Colors, isRichTextElement } from '../domain';

export type BoardAiPreset = 'differentiate' | 'exercises' | 'simplify' | 'selfCheck' | 'free';

export type BoardAiCardElement = { kind: 'text'; text: string } | { kind: 'link'; title: string; url: string };

export interface BoardAiCard {
	type: 'card';
	title: string;
	color?: Colors;
	elements: BoardAiCardElement[];
}

const MAX_TITLE_LENGTH = 100;
const MAX_TEXT_LENGTH = 2000;
const MAX_ELEMENTS_PER_CARD = 3;
const MAX_CARDS = 6;
/** enough of the source for the model to work with, not enough to blow up a prompt */
const MAX_CONTEXT_LENGTH = 4000;

const CARD_COLORS = new Set<string>(Object.values(Colors));

const BASE_PROMPT = [
	'You help a teacher who is working on a board in a school learning platform.',
	'A board holds columns, a column holds cards, a card holds a title and content.',
	'Answer as newline delimited json, one card per line and nothing else - no prose, no markdown, no code fences.',
	'Every line looks like {"type":"card","title":"...","color":"...","elements":[...]}.',
	'A card carries at most three elements, each one of',
	'{"kind":"text","text":"<p>...</p>"} - simple html, only <p>, <strong>, <ul>, <ol> and <li>;',
	'{"kind":"link","title":"...","url":"https://..."} - only stable, well known public sources you are sure exist.',
	'Allowed colours are red, orange, amber, yellow, green, teal, blue, lightBlue, purple, grey and blueGrey.',
	'Stay on the subject matter of the material you are given, keep the level of the learners it addresses,',
	'and write placeholders where a fact is needed that you cannot know.',
	'Answer in the language of the material.',
].join(' ');

const PRESET_PROMPTS: Record<BoardAiPreset, string> = {
	differentiate: [
		'Write exactly two cards for the same task at two levels.',
		'The first one supports weaker learners: smaller steps, a worked example, a word bank, colour it teal.',
		'The second one challenges stronger learners: transfer, justification, an open question, colour it purple.',
		'Start each title with the level it addresses.',
	].join(' '),
	exercises: [
		'Write three to four exercise cards on the material, from basic practice to transfer,',
		'each with a clear task and, where it helps, a hint. Colour them red.',
		'End with one card that holds the solutions or solution hints, coloured grey.',
	].join(' '),
	simplify: [
		'Write exactly one card that says the same thing in simpler language:',
		'short sentences, one thought per sentence, subject terms explained in a half sentence, no nested clauses.',
		'Keep every technical fact intact. Colour it lightBlue and mark the title as the easier version.',
	].join(' '),
	selfCheck: [
		'Write one card with which learners check themselves: a handful of "I can ..." statements as a list,',
		'and a second card with short answers or hints they can compare against. Colour them green and grey.',
	].join(' '),
	free: 'Follow the instruction of the teacher. Write at most four cards.',
};

/**
 * Suggests cards for an existing board: the teacher picks a card or a column as the source, the
 * model reads what is there and writes new cards next to it. Nothing is changed in place - the
 * client inserts the cards only after the teacher accepted them.
 */
@Injectable()
export class BoardAiCardsService {
	constructor(private readonly aiSuggestionService: AiSuggestionService) {}

	public isConfigured(): boolean {
		return this.aiSuggestionService.isConfigured();
	}

	public async *generate(source: AnyBoardNode[], preset: BoardAiPreset, prompt = ''): AsyncGenerator<BoardAiCard> {
		const systemPrompt = `${BASE_PROMPT} ${PRESET_PROMPTS[preset]}`;
		const userPrompt = this.buildUserPrompt(source, preset, prompt);
		let cardCount = 0;

		for await (const line of this.aiSuggestionService.streamJsonLines(systemPrompt, userPrompt)) {
			const card = this.parseCard(line);
			if (card === undefined) continue;

			cardCount += 1;
			if (cardCount > MAX_CARDS) return;

			card.elements = await this.usableElements(card.elements);
			yield card;
		}
	}

	/** the material the teacher points at, flattened into something a model can read */
	private buildUserPrompt(source: AnyBoardNode[], preset: BoardAiPreset, prompt: string): string {
		const material = source
			.map((node) => this.describe(node))
			.filter((description) => description.length > 0)
			.join('\n\n')
			.slice(0, MAX_CONTEXT_LENGTH);

		const instruction = preset === 'free' && prompt.length > 0 ? `\n\nAuftrag der Lehrkraft:\n${prompt}` : '';

		return `Material:\n${material || '(die Karte ist noch leer)'}${instruction}`;
	}

	private describe(node: AnyBoardNode): string {
		if (node instanceof Card) {
			const texts = node.children.filter(isRichTextElement).map((element) => element.text);

			return [node.title ?? '', ...texts].filter((part) => part.length > 0).join('\n');
		}

		return isRichTextElement(node) ? node.text : '';
	}

	private parseCard(parsed: unknown): BoardAiCard | undefined {
		const item = parsed as { type?: string; title?: unknown; color?: unknown; elements?: unknown };
		if (item.type !== 'card') return undefined;

		const title = this.shorten(item.title, MAX_TITLE_LENGTH);
		if (title === undefined) return undefined;

		return {
			type: 'card',
			title,
			color: typeof item.color === 'string' && CARD_COLORS.has(item.color) ? (item.color as Colors) : undefined,
			elements: this.parseElements(item.elements),
		};
	}

	private parseElements(elements: unknown): BoardAiCardElement[] {
		if (!Array.isArray(elements)) return [];

		return elements
			.slice(0, MAX_ELEMENTS_PER_CARD)
			.map((element) => this.parseElement(element))
			.filter((element): element is BoardAiCardElement => element !== undefined);
	}

	private parseElement(element: unknown): BoardAiCardElement | undefined {
		const candidate = element as { kind?: string; text?: unknown; title?: unknown; url?: unknown };

		if (candidate.kind === 'text') {
			const text = this.shorten(candidate.text, MAX_TEXT_LENGTH);
			return text === undefined ? undefined : { kind: 'text', text };
		}
		if (candidate.kind === 'link') {
			const title = this.shorten(candidate.title, MAX_TITLE_LENGTH);
			const url = this.aiSuggestionService.publicUrl(candidate.url);
			return title === undefined || url === undefined ? undefined : { kind: 'link', title, url };
		}

		return undefined;
	}

	private async usableElements(elements: BoardAiCardElement[]): Promise<BoardAiCardElement[]> {
		if (!this.aiSuggestionService.checksLinks) return elements;

		const checked = await Promise.all(
			elements.map(async (element) => {
				if (element.kind !== 'link') return element;

				return (await this.aiSuggestionService.doesResolve(element.url)) ? element : undefined;
			})
		);

		return checked.filter((element): element is BoardAiCardElement => element !== undefined);
	}

	private shorten(value: unknown, maxLength: number): string | undefined {
		if (typeof value !== 'string') return undefined;

		const trimmed = value.trim();
		return trimmed.length === 0 ? undefined : trimmed.slice(0, maxLength);
	}
}
