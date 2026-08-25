import { ErrorLoggable } from '@infra/error';
import { type ErrorLogger } from '@infra/logger';
import { GlobalValidationPipe } from '@core/validation/pipe/global-validation.pipe';
import { type ICurrentUser } from '@infra/auth-guard';
import { type McpServer, type McpToolConfig, type McpToolResult } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpException, type Type } from '@nestjs/common';

/**
 * The same pipe the REST controllers run their bodies through. Reusing it means a tool argument
 * is transformed and validated exactly like the equivalent REST request — including the HTML
 * sanitising that `@SanitizeHtml()` performs on titles and names.
 */
const validationPipe = new GlobalValidationPipe();

/** Plain wrappers like `{ room, allowedOperations }` are walked; anything else is left alone. */
function isPlainObject(value: object): boolean {
	const prototype: unknown = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
}

/** Domain objects expose `getProps()`; entities and responses serialize directly. */
export function serialize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(serialize);
	}

	if (value && typeof value === 'object') {
		const candidate = value as { getProps?: () => Record<string, unknown>; id?: unknown };

		if (typeof candidate.getProps === 'function') {
			// `getProps()` spreads the underlying ORM entity, which leaves the `id` getter behind and
			// exposes a raw `_id` instead. Every other tool takes an `id`, so hand back that shape.
			const props = { ...candidate.getProps() };
			delete props._id;

			return { id: candidate.id, ...props };
		}

		if (isPlainObject(value)) {
			return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
		}
	}

	return value;
}

export function textResult(value: unknown): McpToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(serialize(value), null, 2) }] };
}

/** Builds the REST body DTO from raw tool arguments, so MCP cannot bypass DTO validation. */
export function asBodyParams<T>(metatype: Type<T>, plain: object): Promise<T> {
	return validationPipe.transform(plain, { type: 'body', metatype }) as Promise<T>;
}

/**
 * Nest exceptions carry little more than "Forbidden"; the model only ever sees this string, so
 * name the tool and the status alongside whatever detail the exception offers.
 */
function describe(toolName: string, error: unknown): string {
	if (error instanceof HttpException) {
		const response: unknown = error.getResponse();
		const detail: unknown =
			typeof response === 'string' ? response : ((response as { message?: unknown }).message ?? error.message);
		const text = Array.isArray(detail) ? detail.join('; ') : String(detail);

		return `${toolName} failed with status ${error.getStatus()}: ${text}`;
	}

	return `${toolName} failed: ${error instanceof Error ? error.message : String(error)}`;
}

export type McpToolHandler = (args: Record<string, unknown>) => Promise<McpToolResult>;

/**
 * A group of MCP tools bound to one authenticated user. Register tools through `this.tool()`
 * rather than `server.registerTool()` so failures are logged server-side — the SDK swallows a
 * thrown error into an `isError` result that never reaches the application log.
 */
export abstract class McpToolGroup {
	protected constructor(private readonly errorLogger: ErrorLogger) {}

	public abstract register(server: McpServer, user: ICurrentUser): void;

	protected tool(server: McpServer, name: string, config: McpToolConfig, handler: McpToolHandler): void {
		server.registerTool(name, config, async (args: Record<string, unknown>): Promise<McpToolResult> => {
			try {
				const result = await handler(args);

				return result;
			} catch (error: unknown) {
				this.errorLogger.error(new ErrorLoggable(error, { toolName: name }));

				throw new Error(describe(name, error));
			}
		});
	}
}
