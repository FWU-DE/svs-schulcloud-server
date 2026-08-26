import { Card } from './card.do';
import { ColumnBoard } from './colum-board.do';
import { Column } from './column.do';
import { CardReactionType } from './types';

/**
 * Comment and feedback settings cascade room → board → column → card. Every level holds a
 * tri-state: an explicit value wins over everything above it, `undefined` means "whatever the
 * level above says". The bottom of the chain is off, so a board nobody configured behaves the
 * way it did before these settings existed.
 *
 * The room sits outside the board tree, so its values are read off the prepared board context
 * rather than off a node.
 */
export interface BoardSettingsChain {
	card?: Card;
	column?: Column;
	board?: ColumnBoard;
	roomCommentsEnabled?: boolean;
	roomReactionType?: CardReactionType;
}

const firstDefined = <T>(...values: (T | undefined)[]): T | undefined =>
	values.find((value) => value !== undefined);

export const resolveCommentsEnabled = (chain: BoardSettingsChain): boolean =>
	firstDefined(
		chain.card?.commentsEnabled,
		chain.column?.commentsEnabled,
		chain.board?.commentsEnabled,
		chain.roomCommentsEnabled
	) ?? false;

export const resolveReactionType = (chain: BoardSettingsChain): CardReactionType =>
	firstDefined(
		chain.card?.reactionType,
		chain.column?.reactionType,
		chain.board?.reactionType,
		chain.roomReactionType
	) ?? CardReactionType.NONE;
