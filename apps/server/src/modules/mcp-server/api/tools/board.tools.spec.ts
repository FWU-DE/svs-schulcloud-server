import { ErrorLogger } from '@infra/logger';
import { createMock, type DeepMocked } from '@golevelup/ts-jest';
import { type ICurrentUser } from '@infra/auth-guard';
import { type McpServer, type McpToolCallback, type McpToolResult } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LinkContentBody, RichTextContentBody } from '@modules/board/controller/dto';
import { ContentElementType } from '@modules/board/domain';
import { cardFactory, columnBoardFactory, columnFactory, richTextElementFactory } from '@modules/board/testing';
import { BoardUc, CardUc, ColumnUc, ElementUc } from '@modules/board/uc';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { currentUserFactory } from '@testing/factory/currentuser.factory';
import { BoardTools } from './board.tools';

/** Captures what the tool group registers, so the handlers can be called without a transport. */
class ToolCollector {
	public readonly handlers = new Map<string, McpToolCallback>();

	public readonly server = {
		registerTool: (name: string, _config: unknown, callback: McpToolCallback): void => {
			this.handlers.set(name, callback);
		},
	} as unknown as McpServer;

	public call(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
		const handler = this.handlers.get(name);
		if (!handler) {
			throw new Error(`tool ${name} was not registered`);
		}

		return Promise.resolve(handler(args));
	}
}

const payloadOf = (result: McpToolResult): Record<string, unknown> =>
	JSON.parse(result.content[0].text) as Record<string, unknown>;

describe(BoardTools.name, () => {
	let module: TestingModule;
	let boardTools: BoardTools;
	let boardUc: DeepMocked<BoardUc>;
	let columnUc: DeepMocked<ColumnUc>;
	let cardUc: DeepMocked<CardUc>;
	let elementUc: DeepMocked<ElementUc>;
	let errorLogger: DeepMocked<ErrorLogger>;
	let currentUser: ICurrentUser;
	let tools: ToolCollector;

	beforeAll(async () => {
		module = await Test.createTestingModule({
			providers: [
				BoardTools,
				{ provide: BoardUc, useValue: createMock<BoardUc>() },
				{ provide: ColumnUc, useValue: createMock<ColumnUc>() },
				{ provide: CardUc, useValue: createMock<CardUc>() },
				{ provide: ElementUc, useValue: createMock<ElementUc>() },
				{ provide: ErrorLogger, useValue: createMock<ErrorLogger>() },
			],
		}).compile();

		boardTools = module.get(BoardTools);
		boardUc = module.get(BoardUc);
		columnUc = module.get(ColumnUc);
		cardUc = module.get(CardUc);
		elementUc = module.get(ElementUc);
		errorLogger = module.get(ErrorLogger);
	});

	afterAll(async () => {
		await module.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
		currentUser = currentUserFactory.build();
		tools = new ToolCollector();
		boardTools.register(tools.server, currentUser);
	});

	const setupBoard = () => {
		const element = richTextElementFactory.build();
		const card = cardFactory.build({ children: [element] });
		const column = columnFactory.build({ children: [card] });
		const board = columnBoardFactory.build({ children: [column] });

		boardUc.createBoard.mockResolvedValue(board);
		boardUc.createColumn.mockResolvedValue(column);
		boardUc.updateVisibility.mockResolvedValue(board);
		boardUc.findBoard.mockResolvedValue({ board, features: [], allowedOperations: {} as never });
		columnUc.createCard.mockResolvedValue(card);
		cardUc.createElement.mockResolvedValue(element);

		return { board, column, card, element };
	};

	it('registers the board tools', () => {
		expect([...tools.handlers.keys()]).toEqual([
			'create_board',
			'get_board',
			'add_column',
			'add_card',
			'add_card_element',
			'set_board_visibility',
		]);
	});

	describe('create_board', () => {
		it('creates the board and its whole content tree', async () => {
			const { board, column, card, element } = setupBoard();

			await tools.call('create_board', {
				parentType: 'room',
				parentId: '65f0a1b2c3d4e5f6a7b8c9d0',
				title: 'Wochenplan',
				columns: [{ title: 'Material', cards: [{ title: 'Einstieg', elements: [{ type: 'text', text: 'Hallo' }] }] }],
			});

			expect(boardUc.createBoard).toHaveBeenCalledWith(
				currentUser.userId,
				expect.objectContaining({ title: 'Wochenplan', parentId: '65f0a1b2c3d4e5f6a7b8c9d0', parentType: 'room' })
			);
			expect(boardUc.createColumn).toHaveBeenCalledWith(currentUser.userId, board.id);
			expect(columnUc.updateColumnTitle).toHaveBeenCalledWith(currentUser.userId, column.id, 'Material');
			expect(columnUc.createCard).toHaveBeenCalledWith(currentUser.userId, column.id);
			expect(cardUc.updateCardTitle).toHaveBeenCalledWith(currentUser.userId, card.id, 'Einstieg');
			expect(cardUc.createElement).toHaveBeenCalledWith(currentUser.userId, card.id, ContentElementType.RICH_TEXT);
			expect(elementUc.updateElement).toHaveBeenCalledWith(
				currentUser.userId,
				element.id,
				expect.objectContaining({ text: '<p>Hallo</p>', inputFormat: 'richTextCk5' })
			);
		});

		it('publishes the board, unlike the REST default', async () => {
			const { board } = setupBoard();

			await tools.call('create_board', { parentType: 'room', parentId: board.id, title: 'Wochenplan' });

			expect(boardUc.updateVisibility).toHaveBeenCalledWith(currentUser.userId, board.id, true);
		});

		it('keeps the board a draft when asked to', async () => {
			const { board } = setupBoard();

			await tools.call('create_board', {
				parentType: 'room',
				parentId: board.id,
				title: 'Wochenplan',
				isVisible: false,
			});

			expect(boardUc.updateVisibility).toHaveBeenCalledWith(currentUser.userId, board.id, false);
		});

		it('returns the board with its columns and card contents', async () => {
			const { board, card } = setupBoard();

			const result = await tools.call('create_board', { parentType: 'room', parentId: board.id, title: 'Wochenplan' });

			expect(payloadOf(result)).toEqual(
				expect.objectContaining({
					id: board.id,
					isVisible: board.isVisible,
					columns: [expect.objectContaining({ cards: [expect.objectContaining({ id: card.id })] })],
				})
			);
		});
	});

	describe('add_card_element', () => {
		it('passes rich text as the content body the update service dispatches on', async () => {
			const { card } = setupBoard();

			await tools.call('add_card_element', { cardId: card.id, type: 'text', text: '<p>Hallo</p>' });

			const [, , content] = elementUc.updateElement.mock.calls[0];
			expect(content).toBeInstanceOf(RichTextContentBody);
			expect(content).toEqual({ text: '<p>Hallo</p>', inputFormat: 'richTextCk5' });
		});

		it('stores a link element with its label', async () => {
			const { card } = setupBoard();

			await tools.call('add_card_element', {
				cardId: card.id,
				type: 'link',
				url: 'https://dbildungscloud.de',
				title: 'dBildungscloud',
			});

			expect(cardUc.createElement).toHaveBeenCalledWith(currentUser.userId, card.id, ContentElementType.LINK);
			const [, , content] = elementUc.updateElement.mock.calls[0];
			expect(content).toBeInstanceOf(LinkContentBody);
			expect(content).toEqual({ url: 'https://dbildungscloud.de', title: 'dBildungscloud' });
		});

		it('rejects a link element without a url', async () => {
			const { card } = setupBoard();

			await expect(tools.call('add_card_element', { cardId: card.id, type: 'link' })).rejects.toThrow(
				'add_card_element failed: A link element needs a url.'
			);
		});
	});

	describe('when a use-case denies the call', () => {
		it('logs the cause and reports tool, status and message', async () => {
			setupBoard();
			boardUc.createBoard.mockRejectedValueOnce(new ForbiddenException('not your room'));

			await expect(
				tools.call('create_board', {
					parentType: 'room',
					parentId: '65f0a1b2c3d4e5f6a7b8c9d0',
					title: 'Wochenplan',
				})
			).rejects.toThrow('create_board failed with status 403: not your room');
			expect(errorLogger.error).toHaveBeenCalled();
		});
	});
});
