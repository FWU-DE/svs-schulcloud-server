import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { AI_SUGGESTION_CONFIG_TOKEN, AiSuggestionConfig } from './ai-suggestion.config';

/**
 * Talks to a chat completion api and hands back whole json lines while the model is still
 * writing. Newline delimited json is what makes that possible: a finished line is usable, a
 * half written object would not be.
 *
 * The service knows nothing about rooms, boards or prompts - the features own their prompt and
 * their validation, this class owns the transport.
 */
@Injectable()
export class AiSuggestionService {
	constructor(@Inject(AI_SUGGESTION_CONFIG_TOKEN) private readonly config: AiSuggestionConfig) {}

	public isConfigured(): boolean {
		return this.config.apiKey.length > 0;
	}

	get checksLinks(): boolean {
		return this.config.checkLinks;
	}

	public async *streamJsonLines(systemPrompt: string, userPrompt: string): AsyncGenerator<unknown> {
		const response = await this.requestCompletion(systemPrompt, userPrompt);

		for await (const line of this.readLines(response)) {
			try {
				yield JSON.parse(line.trim());
			} catch {
				// a line the model broke, a code fence or a stray sentence - the next one may be fine
				continue;
			}
		}
	}

	/** a link the model made up is worse than no link at all, so every reference is probed once */
	public async doesResolve(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, {
				method: 'HEAD',
				redirect: 'follow',
				signal: AbortSignal.timeout(this.config.linkCheckTimeoutMs),
			});

			// a site that dislikes HEAD still tells us that it exists
			return response.status !== 404 && response.status !== 410;
		} catch {
			return false;
		}
	}

	/** only public https addresses, a made up scheme or an internal host has no place on a card */
	public publicUrl(url: unknown): string | undefined {
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

	private async requestCompletion(systemPrompt: string, userPrompt: string): Promise<Response> {
		const response = await fetch(this.config.apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.authHeader(),
			},
			body: JSON.stringify({
				model: this.config.model,
				stream: true,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
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
		return this.config.apiStyle === 'azure'
			? { 'api-key': this.config.apiKey }
			: { Authorization: `Bearer ${this.config.apiKey}` };
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
}
