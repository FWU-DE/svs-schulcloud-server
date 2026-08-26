import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CONTENT_SEARCH_CONFIG_TOKEN, ContentSearchConfig } from './content-search.config';

interface JsonRpcResponse {
	result?: { content?: { type: string; text?: string }[]; isError?: boolean };
	error?: { code: number; message: string };
}

/**
 * A small client for a remote mcp server over streamable http. It is deliberately stateless: the
 * remote side hands out a session on `initialize`, we use it for one call and let it go, the same
 * way our own mcp endpoint treats its callers.
 */
@Injectable()
export class McpClientService {
	constructor(@Inject(CONTENT_SEARCH_CONFIG_TOKEN) private readonly config: ContentSearchConfig) {}

	public async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		const sessionId = await this.openSession();
		const response = await this.post(
			{ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
			sessionId
		);

		const message = this.parseMessage(await response.text());
		if (message.error) {
			throw new InternalServerErrorException(`The content search answered: ${message.error.message}`);
		}
		if (message.result?.isError) {
			throw new InternalServerErrorException(`The content search rejected the call to ${name}`);
		}

		return this.parseToolContent(message);
	}

	private async openSession(): Promise<string> {
		const response = await this.post({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2024-11-05',
				capabilities: {},
				clientInfo: { name: 'schulcloud-server', version: '1.0' },
			},
		});

		const sessionId = response.headers.get('mcp-session-id');
		if (sessionId === null) {
			throw new InternalServerErrorException('The content search did not hand out a session');
		}

		// the protocol wants this acknowledgement before the session accepts calls
		await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);

		return sessionId;
	}

	private async post(body: Record<string, unknown>, sessionId?: string): Promise<Response> {
		const response = await fetch(this.config.mcpUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				...(sessionId === undefined ? {} : { 'Mcp-Session-Id': sessionId }),
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(this.config.timeoutMs),
		});

		if (!response.ok) {
			throw new InternalServerErrorException(`The content search answered with status ${response.status}`);
		}

		return response;
	}

	/** the remote server answers either as plain json or as a single server sent event */
	private parseMessage(payload: string): JsonRpcResponse {
		const eventData = payload
			.split('\n')
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice('data:'.length).trim())
			.join('');

		try {
			return JSON.parse(eventData.length > 0 ? eventData : payload) as JsonRpcResponse;
		} catch {
			throw new InternalServerErrorException('The content search sent an answer we cannot read');
		}
	}

	/** tool results arrive as text content that carries the actual json */
	private parseToolContent(message: JsonRpcResponse): unknown {
		const text = message.result?.content?.find((part) => part.type === 'text')?.text;
		if (text === undefined) return undefined;

		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}
}
