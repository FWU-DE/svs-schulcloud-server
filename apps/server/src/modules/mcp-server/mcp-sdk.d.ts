/**
 * Minimal ambient typings for the (ESM-only) MCP SDK subpaths we use.
 *
 * The repo compiles with `module: commonjs` / `moduleResolution: node`, which cannot
 * resolve the SDK's `exports`-mapped subpaths for type-checking. These declarations let
 * us import the SDK with normal `import` statements; at runtime Node 24's `require(ESM)`
 * loads the actual modules. Keep the surface here in sync with the SDK version in
 * package.json if we start using more of its API.
 */
declare module '@modelcontextprotocol/sdk/server/mcp.js' {
	import type { ZodRawShape } from 'zod';

	export interface McpToolTextContent {
		type: 'text';
		text: string;
	}

	export interface McpToolResult {
		content: McpToolTextContent[];
		isError?: boolean;
	}

	export interface McpToolConfig {
		title?: string;
		description?: string;
		inputSchema?: ZodRawShape;
	}

	export type McpToolCallback = (args: Record<string, unknown>) => Promise<McpToolResult> | McpToolResult;

	export class McpServer {
		constructor(serverInfo: { name: string; version: string });

		public registerTool(name: string, config: McpToolConfig, cb: McpToolCallback): void;

		public connect(transport: unknown): Promise<void>;

		public close(): Promise<void>;
	}
}

declare module '@modelcontextprotocol/sdk/server/streamableHttp.js' {
	import type { IncomingMessage, ServerResponse } from 'http';

	export interface StreamableHTTPServerTransportOptions {
		sessionIdGenerator: (() => string) | undefined;
		enableJsonResponse?: boolean;
	}

	export class StreamableHTTPServerTransport {
		constructor(options: StreamableHTTPServerTransportOptions);

		public handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;

		public close(): Promise<void>;
	}
}
