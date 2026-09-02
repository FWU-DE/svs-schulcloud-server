import { ObjectId } from '@mikro-orm/mongodb';
import { BOARD_PREVIEW_LIMITS, buildBoardPreviews, type BoardPreviewNode } from './board-preview';
import { joinPath, ROOT_PATH } from './path-utils';
import { BoardNodeType, Colors, ContentElementType } from './types';

describe('buildBoardPreviews', () => {
	const node = (props: Partial<BoardPreviewNode> & Pick<BoardPreviewNode, 'path' | 'level' | 'type'>) => {
		return {
			id: new ObjectId().toHexString(),
			position: 0,
			...props,
		};
	};

	describe('when a board has no descendants', () => {
		it('should return an empty preview', () => {
			const boardId = new ObjectId().toHexString();

			const previews = buildBoardPreviews([boardId], []);

			expect(previews.get(boardId)).toEqual({ columns: [], columnCount: 0 });
		});
	});

	describe('when boards have columns, cards and elements', () => {
		const setup = () => {
			const boardId = new ObjectId().toHexString();
			const columnsPath = joinPath(ROOT_PATH, boardId);

			const column = node({ path: columnsPath, level: 1, type: BoardNodeType.COLUMN, title: 'To do' });
			const cardsPath = joinPath(columnsPath, column.id);
			const card = node({
				path: cardsPath,
				level: 2,
				type: BoardNodeType.CARD,
				backgroundColor: Colors.AMBER,
			});
			const elementsPath = joinPath(cardsPath, card.id);
			const text = node({ path: elementsPath, level: 3, type: BoardNodeType.RICH_TEXT_ELEMENT, position: 0 });
			const poll = node({ path: elementsPath, level: 3, type: BoardNodeType.POLL_ELEMENT, position: 1 });

			return { boardId, nodes: [poll, card, column, text] };
		};

		it('should nest them by path and order them by position', () => {
			const { boardId, nodes } = setup();

			const preview = buildBoardPreviews([boardId], nodes).get(boardId);

			expect(preview).toEqual({
				columnCount: 1,
				columns: [
					{
						title: 'To do',
						cardCount: 1,
						cards: [
							{
								backgroundColor: Colors.AMBER,
								elementTypes: [ContentElementType.RICH_TEXT, ContentElementType.POLL],
								elementCount: 2,
							},
						],
					},
				],
			});
		});
	});

	describe('when a card has no color', () => {
		it('should fall back to transparent', () => {
			const boardId = new ObjectId().toHexString();
			const columnsPath = joinPath(ROOT_PATH, boardId);
			const column = node({ path: columnsPath, level: 1, type: BoardNodeType.COLUMN });
			const card = node({ path: joinPath(columnsPath, column.id), level: 2, type: BoardNodeType.CARD });

			const preview = buildBoardPreviews([boardId], [column, card]).get(boardId);

			expect(preview?.columns[0].cards[0].backgroundColor).toBe(Colors.TRANSPARENT);
		});
	});

	describe('when a board is larger than a preview', () => {
		const setup = () => {
			const boardId = new ObjectId().toHexString();
			const columnsPath = joinPath(ROOT_PATH, boardId);

			const columnCount = BOARD_PREVIEW_LIMITS.columns + 2;
			const cardCount = BOARD_PREVIEW_LIMITS.cardsPerColumn + 3;
			const elementCount = BOARD_PREVIEW_LIMITS.elementsPerCard + 1;

			const nodes: BoardPreviewNode[] = [];
			for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
				const column = node({ path: columnsPath, level: 1, type: BoardNodeType.COLUMN, position: columnIndex });
				nodes.push(column);

				for (let cardIndex = 0; cardIndex < cardCount; cardIndex += 1) {
					const card = node({
						path: joinPath(columnsPath, column.id),
						level: 2,
						type: BoardNodeType.CARD,
						position: cardIndex,
					});
					nodes.push(card);

					for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
						nodes.push(
							node({
								path: joinPath(card.path, card.id),
								level: 3,
								type: BoardNodeType.RICH_TEXT_ELEMENT,
								position: elementIndex,
							})
						);
					}
				}
			}

			return { boardId, nodes, columnCount, cardCount, elementCount };
		};

		it('should truncate but keep the totals', () => {
			const { boardId, nodes, columnCount, cardCount, elementCount } = setup();

			const preview = buildBoardPreviews([boardId], nodes).get(boardId);

			expect(preview?.columnCount).toBe(columnCount);
			expect(preview?.columns).toHaveLength(BOARD_PREVIEW_LIMITS.columns);
			expect(preview?.columns[0].cardCount).toBe(cardCount);
			expect(preview?.columns[0].cards).toHaveLength(BOARD_PREVIEW_LIMITS.cardsPerColumn);
			expect(preview?.columns[0].cards[0].elementCount).toBe(elementCount);
			expect(preview?.columns[0].cards[0].elementTypes).toHaveLength(BOARD_PREVIEW_LIMITS.elementsPerCard);
		});
	});

	describe('when a node type has no preview representation', () => {
		it('should skip it but still count it', () => {
			const boardId = new ObjectId().toHexString();
			const columnsPath = joinPath(ROOT_PATH, boardId);
			const column = node({ path: columnsPath, level: 1, type: BoardNodeType.COLUMN });
			const card = node({ path: joinPath(columnsPath, column.id), level: 2, type: BoardNodeType.CARD });
			const unknown = node({ path: joinPath(card.path, card.id), level: 3, type: BoardNodeType.MEDIA_LINE });

			const preview = buildBoardPreviews([boardId], [column, card, unknown]).get(boardId);

			expect(preview?.columns[0].cards[0]).toEqual({
				backgroundColor: Colors.TRANSPARENT,
				elementTypes: [],
				elementCount: 1,
			});
		});
	});

	describe('when several boards are previewed at once', () => {
		it('should keep their content apart', () => {
			const firstBoardId = new ObjectId().toHexString();
			const secondBoardId = new ObjectId().toHexString();
			const firstColumn = node({
				path: joinPath(ROOT_PATH, firstBoardId),
				level: 1,
				type: BoardNodeType.COLUMN,
				title: 'first',
			});
			const secondColumn = node({
				path: joinPath(ROOT_PATH, secondBoardId),
				level: 1,
				type: BoardNodeType.COLUMN,
				title: 'second',
			});

			const previews = buildBoardPreviews([firstBoardId, secondBoardId], [firstColumn, secondColumn]);

			expect(previews.get(firstBoardId)?.columns.map((column) => column.title)).toEqual(['first']);
			expect(previews.get(secondBoardId)?.columns.map((column) => column.title)).toEqual(['second']);
		});
	});
});
