import { ICurrentUser } from '@infra/auth-guard';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Injectable } from '@nestjs/common';
import { BoardTools, CourseTools, McpToolGroup, RoomTools } from './tools';

const SERVER_INFO = { name: 'schulcloud-mcp', version: '0.1.0' };

/**
 * Builds a per-request `McpServer` whose tools are bound to a specific authenticated user.
 * Every tool calls the same use-cases as the REST API, so authorization is unchanged.
 */
@Injectable()
export class McpServerFactory {
	private readonly toolGroups: McpToolGroup[];

	constructor(roomTools: RoomTools, courseTools: CourseTools, boardTools: BoardTools) {
		this.toolGroups = [roomTools, courseTools, boardTools];
	}

	public build(currentUser: ICurrentUser): McpServer {
		const server = new McpServer(SERVER_INFO);

		this.toolGroups.forEach((group) => group.register(server, currentUser));

		return server;
	}
}
