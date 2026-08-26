import { BoardNode } from './board-node.do';
import { Card } from './card.do';
import type { AnyBoardNode, CardReactionType, ColumnProps } from './types';

export class Column extends BoardNode<ColumnProps> {
	get title(): string | undefined {
		return this.props.title;
	}

	set title(title: string | undefined) {
		this.props.title = title;
	}

	/** `undefined` follows the board. */
	get commentsEnabled(): boolean | undefined {
		return this.props.commentsEnabled;
	}

	set commentsEnabled(value: boolean | undefined) {
		this.props.commentsEnabled = value;
	}

	/** `undefined` follows the board. */
	get reactionType(): CardReactionType | undefined {
		return this.props.reactionType;
	}

	set reactionType(value: CardReactionType | undefined) {
		this.props.reactionType = value;
	}

	public canHaveChild(childNode: AnyBoardNode): boolean {
		return childNode instanceof Card;
	}
}

export const isColumn = (reference: unknown): reference is Column => reference instanceof Column;
