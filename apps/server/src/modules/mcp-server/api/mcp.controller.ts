import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CurrentUser, ICurrentUser, JwtAuthentication } from '@infra/auth-guard';
import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { McpServerFactory } from './mcp-server.factory';

function jsonRpcError(message: string): { jsonrpc: '2.0'; error: { code: number; message: string }; id: null } {
	return { jsonrpc: '2.0', error: { code: -32000, message }, id: null };
}

/**
 * MCP (Model Context Protocol) endpoint over Streamable HTTP.
 *
 * Stateless: each POST is authenticated via the standard JWT guard, a fresh `McpServer`
 * bound to that user is created, the request is handled, and everything is torn down on
 * connection close. GET/DELETE (used for SSE streams / session teardown in stateful mode)
 * are intentionally not supported.
 *
 * Clients must send `Accept: application/json, text/event-stream` — the transport rejects
 * anything else with 406, even though `enableJsonResponse` makes it answer in plain JSON.
 * Nothing here pushes to the client, so a stream would only complicate every caller.
 */
@ApiTags('MCP')
@JwtAuthentication()
@Controller('mcp')
export class McpController {
	constructor(private readonly factory: McpServerFactory) {}

	@Post()
	public async handlePost(
		@CurrentUser() currentUser: ICurrentUser,
		@Req() req: Request,
		@Res() res: Response
	): Promise<void> {
		const server = this.factory.build(currentUser);
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

		res.on('close', () => {
			void transport.close();
			void server.close();
		});

		await server.connect(transport);
		await transport.handleRequest(req, res, req.body);
	}

	@Get()
	public handleGet(@Res() res: Response): void {
		res.status(405).json(jsonRpcError('Method not allowed. This stateless MCP endpoint only accepts POST.'));
	}

	@Delete()
	public handleDelete(@Res() res: Response): void {
		res.status(405).json(jsonRpcError('Method not allowed. This stateless MCP endpoint only accepts POST.'));
	}
}
