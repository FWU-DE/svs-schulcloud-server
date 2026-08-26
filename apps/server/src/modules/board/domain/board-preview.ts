import { type EntityId } from '@shared/domain/types';
import { joinPath, pathOfChildren, ROOT_PATH } from './path-utils';
import { BoardNodeType, Colors, ContentElementType } from './types';

/**
 * A miniature of a board: what a column, a card and its elements look like from far away.
 * Deliberately without any content — a preview shows the shape of a board, not what it says,
 * so it stays cheap enough to send along with a list of boards.
 */
export interface BoardPreviewCard {
	backgroundColor: Colors;
	elementTypes: ContentElementType[];
	elementCount: number;
}

export interface BoardPreviewColumn {
	title?: string;
	cards: BoardPreviewCard[];
	cardCount: number;
}

export interface BoardPreview {
	columns: BoardPreviewColumn[];
	columnCount: number;
}

/** How many boards a context holds - `visible` leaves out the drafts. */
export interface BoardCounts {
	total: number;
	visible: number;
}

/** A board node reduced to the fields a preview needs. */
export interface BoardPreviewNode {
	id: EntityId;
	path: string;
	level: number;
	position: number;
	type: BoardNodeType;
	title?: string;
	backgroundColor?: Colors;
}

/**
 * More than this never fits into a tile, and counting is enough for the rest:
 * the response carries the totals so the client can render a "+3".
 */
export const BOARD_PREVIEW_LIMITS = {
	columns: 6,
	cardsPerColumn: 8,
	elementsPerCard: 3,
} as const;

/** Columns, cards, elements — the three levels below a board. */
export const BOARD_PREVIEW_DEPTH = 3;

const CONTENT_ELEMENT_TYPE_BY_NODE_TYPE: Partial<Record<BoardNodeType, ContentElementType>> = {
	[BoardNodeType.FILE_ELEMENT]: ContentElementType.FILE,
	[BoardNodeType.FILE_FOLDER_ELEMENT]: ContentElementType.FILE_FOLDER,
	[BoardNodeType.LINK_ELEMENT]: ContentElementType.LINK,
	[BoardNodeType.RICH_TEXT_ELEMENT]: ContentElementType.RICH_TEXT,
	[BoardNodeType.DRAWING_ELEMENT]: ContentElementType.DRAWING,
	[BoardNodeType.EXTERNAL_TOOL]: ContentElementType.EXTERNAL_TOOL,
	[BoardNodeType.COLLABORATIVE_TEXT_EDITOR]: ContentElementType.COLLABORATIVE_TEXT_EDITOR,
	[BoardNodeType.DELETED_ELEMENT]: ContentElementType.DELETED,
	[BoardNodeType.VIDEO_CONFERENCE_ELEMENT]: ContentElementType.VIDEO_CONFERENCE,
	[BoardNodeType.H5P_ELEMENT]: ContentElementType.H5P,
	[BoardNodeType.POLL_ELEMENT]: ContentElementType.POLL,
	[BoardNodeType.DEADLINE_ELEMENT]: ContentElementType.DEADLINE,
	[BoardNodeType.CODE_ELEMENT]: ContentElementType.CODE,
	[BoardNodeType.FORMULA_ELEMENT]: ContentElementType.FORMULA,
	[BoardNodeType.CHECKLIST_ELEMENT]: ContentElementType.CHECKLIST,
	[BoardNodeType.RECORDING_ELEMENT]: ContentElementType.RECORDING,
};

export const emptyBoardPreview = (): BoardPreview => {
	return { columns: [], columnCount: 0 };
};

const groupByPath = (nodes: BoardPreviewNode[]): Map<string, BoardPreviewNode[]> => {
	const groups = new Map<string, BoardPreviewNode[]>();

	for (const node of nodes) {
		const siblings = groups.get(node.path);
		if (siblings) {
			siblings.push(node);
		} else {
			groups.set(node.path, [node]);
		}
	}
	for (const siblings of groups.values()) {
		siblings.sort((a, b) => a.position - b.position);
	}

	return groups;
};

/**
 * Board nodes carry their ancestry in `path`, so the flat list of descendants can be turned into
 * previews without building any board tree.
 */
export const buildBoardPreviews = (boardIds: EntityId[], nodes: BoardPreviewNode[]): Map<EntityId, BoardPreview> => {
	const childrenByPath = groupByPath(nodes);
	const childrenOf = (node: { id: EntityId; path: string }): BoardPreviewNode[] =>
		childrenByPath.get(pathOfChildren(node)) ?? [];

	const buildCard = (card: BoardPreviewNode): BoardPreviewCard => {
		const elements = childrenOf(card);
		const elementTypes = elements
			.slice(0, BOARD_PREVIEW_LIMITS.elementsPerCard)
			.map((element) => CONTENT_ELEMENT_TYPE_BY_NODE_TYPE[element.type])
			.filter((type): type is ContentElementType => type !== undefined);

		return {
			backgroundColor: card.backgroundColor ?? Colors.TRANSPARENT,
			elementTypes,
			elementCount: elements.length,
		};
	};

	const buildColumn = (column: BoardPreviewNode): BoardPreviewColumn => {
		const cards = childrenOf(column);

		return {
			title: column.title,
			cardCount: cards.length,
			cards: cards.slice(0, BOARD_PREVIEW_LIMITS.cardsPerColumn).map(buildCard),
		};
	};

	const previews = new Map<EntityId, BoardPreview>();

	for (const boardId of boardIds) {
		// Column boards are root nodes, so their children sit at ',<boardId>,'.
		const columns = childrenByPath.get(joinPath(ROOT_PATH, boardId)) ?? [];

		previews.set(boardId, {
			columnCount: columns.length,
			columns: columns.slice(0, BOARD_PREVIEW_LIMITS.columns).map(buildColumn),
		});
	}

	return previews;
};
