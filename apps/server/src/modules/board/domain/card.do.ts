import { UnprocessableEntityException } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';
import { BoardNode } from './board-node.do';
import { type AnyBoardNode, type CardProps, type CardReaction, CardReactionType, isContentElement } from './types';
import { reactionRange } from './types/card-reaction';
import { Colors } from './types/colors.enum';

export class Card extends BoardNode<CardProps> {
	get title(): string | undefined {
		return this.props.title;
	}

	set title(title: string | undefined) {
		this.props.title = title;
	}

	get backgroundColor(): Colors {
		return this.props.backgroundColor || Colors.TRANSPARENT;
	}

	set backgroundColor(color: Colors) {
		this.props.backgroundColor = color;
	}

	get height(): number {
		return this.props.height;
	}

	set height(height: number) {
		this.props.height = height;
	}

	get reactions(): CardReaction[] {
		// Cards created before reactions existed have no such field.
		return this.props.reactions ?? [];
	}

	/**
	 * One reaction per person: reacting again replaces the earlier one instead of stacking, so
	 * the count on a card is a count of people.
	 */
	public react(userId: EntityId, type: CardReactionType, value: number): void {
		if (type === CardReactionType.NONE) {
			throw new UnprocessableEntityException('Reactions are turned off for this board');
		}

		const { min, max } = reactionRange(type);
		if (!Number.isInteger(value) || value < min || value > max || value === 0) {
			throw new UnprocessableEntityException(`Reaction value ${value} is out of range for '${type}'`);
		}

		this.withdrawReaction(userId);
		this.props.reactions = [...this.reactions, { userId, value, createdAt: new Date() }];
	}

	public withdrawReaction(userId: EntityId): void {
		this.props.reactions = this.reactions.filter((reaction) => reaction.userId !== userId);
	}

	public getReactionOf(userId: EntityId): number | undefined {
		return this.reactions.find((reaction) => reaction.userId === userId)?.value;
	}

	public canHaveChild(childNode: AnyBoardNode): boolean {
		return isContentElement(childNode);
	}
}

export const isCard = (reference: unknown): reference is Card => reference instanceof Card;
