import { ErrorLogger } from '@infra/logger';
import { ICurrentUser } from '@infra/auth-guard';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AnyBoardNode, BoardExternalReferenceType, BoardLayout, Card, Column, ColumnBoard } from '@modules/board';
import {
	AnyElementContentBody,
	CreateBoardBodyParams,
	LinkContentBody,
	RenameBodyParams,
	RichTextContentBody,
} from '@modules/board/controller/dto';
import { ContentElementType } from '@modules/board/domain';
import { ColumnResponseMapper } from '@modules/board/controller/mapper';
import { BoardUc, CardUc, ColumnUc, ElementUc } from '@modules/board/uc';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { EntityId, InputFormat } from '@shared/domain/types';
import { z } from 'zod';
import { asBodyParams, McpToolGroup, textResult } from './tool-support';

/** The element kinds a tool can fill with content. Files, drawings and tools need an upload or a
 *  context this API has no way to supply, so they are deliberately not offered. */
const elementSchema = z.object({
	type: z.enum(['text', 'link']),
	text: z.string().optional().describe('For type "text": the body. Plain text or simple HTML (<p>, <b>, <ul>, …).'),
	url: z.string().url().optional().describe('For type "link": the target URL.'),
	title: z.string().optional().describe('For type "link": the label shown on the card.'),
	description: z.string().optional().describe('For type "link": an optional short description.'),
});

const cardSchema = z.object({
	title: z.string().max(100).optional(),
	elements: z.array(elementSchema).optional(),
});

const columnSchema = z.object({
	title: z.string().max(100),
	cards: z.array(cardSchema).optional(),
});

type ElementSpec = z.infer<typeof elementSchema>;
type CardSpec = z.infer<typeof cardSchema>;
type ColumnSpec = z.infer<typeof columnSchema>;

/**
 * Tools for board content — the columns, cards and elements that make up what a room or a course
 * actually shows. Creating a board is a chain of six REST calls (board → column → title → card →
 * title → element → content); `create_board` accepts the whole tree at once so an assistant does
 * not have to keep that chain straight, while the single-step tools stay available for edits.
 */
@Injectable()
export class BoardTools extends McpToolGroup {
	constructor(
		private readonly boardUc: BoardUc,
		private readonly columnUc: ColumnUc,
		private readonly cardUc: CardUc,
		private readonly elementUc: ElementUc,
		errorLogger: ErrorLogger
	) {
		super(errorLogger);
	}

	public register(server: McpServer, user: ICurrentUser): void {
		this.tool(
			server,
			'create_board',
			{
				title: 'Create board',
				description:
					'Create a board in a room or course, optionally with its whole content (columns, cards, elements) ' +
					'in one call. Unlike the REST API the board is published right away; pass isVisible=false to keep ' +
					'it a draft that only editors can see.',
				inputSchema: {
					parentType: z.enum([BoardExternalReferenceType.Room, BoardExternalReferenceType.Course]),
					parentId: z.string().min(1),
					title: z.string().min(1).max(100),
					layout: z.enum([BoardLayout.COLUMNS, BoardLayout.LIST]).optional(),
					isVisible: z.boolean().optional(),
					columns: z.array(columnSchema).optional(),
				},
			},
			async (args) => {
				const { parentType, parentId, title, layout, isVisible, columns } = args as {
					parentType: BoardExternalReferenceType;
					parentId: string;
					title: string;
					layout?: BoardLayout;
					isVisible?: boolean;
					columns?: ColumnSpec[];
				};

				const params = await asBodyParams(CreateBoardBodyParams, {
					title,
					parentId,
					parentType,
					layout: layout ?? BoardLayout.COLUMNS,
				});
				const board = await this.boardUc.createBoard(user.userId, params);

				for (const column of columns ?? []) {
					await this.addColumn(user.userId, board.id, column);
				}

				await this.boardUc.updateVisibility(user.userId, board.id, isVisible ?? true);

				return textResult(await this.readBoard(user.userId, board.id));
			}
		);

		this.tool(
			server,
			'get_board',
			{
				title: 'Get board',
				description: 'Read a board with all its columns, cards and element contents.',
				inputSchema: { boardId: z.string().min(1) },
			},
			async (args) => {
				const { boardId } = args as { boardId: string };

				return textResult(await this.readBoard(user.userId, boardId));
			}
		);

		this.tool(
			server,
			'add_column',
			{
				title: 'Add column to board',
				description: 'Append a column to an existing board, optionally with cards and their content.',
				inputSchema: { boardId: z.string().min(1), ...columnSchema.shape },
			},
			async (args) => {
				const { boardId, title, cards } = args as { boardId: string; title: string; cards?: CardSpec[] };
				const column = await this.addColumn(user.userId, boardId, { title, cards });

				return textResult({ id: column.id, title: column.title });
			}
		);

		this.tool(
			server,
			'add_card',
			{
				title: 'Add card to column',
				description: 'Append a card to an existing column, optionally with its elements.',
				inputSchema: { columnId: z.string().min(1), ...cardSchema.shape },
			},
			async (args) => {
				const { columnId, title, elements } = args as {
					columnId: string;
					title?: string;
					elements?: ElementSpec[];
				};
				const card = await this.addCard(user.userId, columnId, { title, elements });

				return textResult({ id: card.id, title: card.title });
			}
		);

		this.tool(
			server,
			'add_card_element',
			{
				title: 'Add element to card',
				description: 'Append a text or link element to an existing card.',
				inputSchema: { cardId: z.string().min(1), ...elementSchema.shape },
			},
			async (args) => {
				const { cardId, ...spec } = args as { cardId: string } & ElementSpec;
				const element = await this.addElement(user.userId, cardId, spec);

				return textResult({ id: element.id, type: spec.type });
			}
		);

		this.tool(
			server,
			'set_board_visibility',
			{
				title: 'Publish or unpublish a board',
				description: 'A board that is not visible is a draft: only users who may edit it see it, students see nothing.',
				inputSchema: { boardId: z.string().min(1), isVisible: z.boolean() },
			},
			async (args) => {
				const { boardId, isVisible } = args as { boardId: string; isVisible: boolean };
				const board = await this.boardUc.updateVisibility(user.userId, boardId, isVisible);

				return textResult({ id: board.id, title: board.title, isVisible: board.isVisible });
			}
		);
	}

	private async addColumn(userId: EntityId, boardId: EntityId, spec: ColumnSpec): Promise<Column> {
		const column = await this.boardUc.createColumn(userId, boardId);
		const { title } = await asBodyParams(RenameBodyParams, { title: spec.title });
		await this.columnUc.updateColumnTitle(userId, column.id, title);

		for (const card of spec.cards ?? []) {
			await this.addCard(userId, column.id, card);
		}

		return column;
	}

	private async addCard(userId: EntityId, columnId: EntityId, spec: CardSpec): Promise<Card> {
		const card = await this.columnUc.createCard(userId, columnId);

		if (spec.title !== undefined) {
			const { title } = await asBodyParams(RenameBodyParams, { title: spec.title });
			await this.cardUc.updateCardTitle(userId, card.id, title);
		}

		for (const element of spec.elements ?? []) {
			await this.addElement(userId, card.id, element);
		}

		return card;
	}

	private async addElement(userId: EntityId, cardId: EntityId, spec: ElementSpec): Promise<AnyBoardNode> {
		const type = spec.type === 'text' ? ContentElementType.RICH_TEXT : ContentElementType.LINK;
		const element = await this.cardUc.createElement(userId, cardId, type);
		await this.elementUc.updateElement(userId, element.id, await this.buildContent(spec));

		return element;
	}

	/**
	 * The update service dispatches on the content body's class and sanitises rich text itself, so
	 * build the very same DTO instances the REST controller would hand it — a plain object literal
	 * is rejected with "Cannot update element of type".
	 */
	private buildContent(spec: ElementSpec): Promise<AnyElementContentBody> {
		if (spec.type === 'text') {
			const raw = spec.text ?? '';
			// CK5 expects markup; wrap a bare sentence so it does not end up as one unstyled run.
			const text = raw.includes('<') ? raw : `<p>${raw}</p>`;

			return asBodyParams(RichTextContentBody, { text, inputFormat: InputFormat.RICH_TEXT_CK5 });
		}

		if (!spec.url) {
			throw new Error('A link element needs a url.');
		}

		return asBodyParams(LinkContentBody, { url: spec.url, title: spec.title, description: spec.description });
	}

	private async readBoard(userId: EntityId, boardId: EntityId): Promise<unknown> {
		const { board, allowedOperations } = await this.boardUc.findBoard(userId, boardId);

		return {
			id: board.id,
			title: board.title,
			isVisible: board.isVisible,
			layout: board.layout,
			// The context is an ORM-backed value object: spelled out, or it serializes to `{}`.
			context: { type: board.context.type, id: board.context.id },
			columns: this.columnsOf(board).map((column) => ColumnResponseMapper.mapToFullResponse(column)),
			allowedOperations,
		};
	}

	private columnsOf(board: ColumnBoard): Column[] {
		return board.children.map((child) => {
			if (!(child instanceof Column)) {
				throw new InternalServerErrorException(`unsupported child type: ${child.constructor.name}`);
			}

			return child;
		});
	}
}
