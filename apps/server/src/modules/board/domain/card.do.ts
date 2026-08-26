import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';
import { BoardNode } from './board-node.do';
import {
	type AnyBoardNode,
	type CardComment,
	type CardProps,
	type CardReaction,
	CardReactionType,
	isContentElement,
} from './types';
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

	/** `undefined` means the card follows the board. */
	get commentsEnabled(): boolean | undefined {
		return this.props.commentsEnabled;
	}

	set commentsEnabled(value: boolean | undefined) {
		this.props.commentsEnabled = value;
	}

	/** `undefined` means the card follows the board. */
	get readersCanEdit(): boolean | undefined {
		return this.props.readersCanEdit;
	}

	set readersCanEdit(value: boolean | undefined) {
		this.props.readersCanEdit = value;
	}

	get comments(): CardComment[] {
		// Cards created before comments existed have no such field.
		return this.props.comments ?? [];
	}

	public addComment(props: { id: string; userId: EntityId; text: string }): CardComment {
		const now = new Date();
		const comment: CardComment = {
			id: props.id,
			userId: props.userId,
			text: props.text,
			createdAt: now,
			updatedAt: now,
			reports: [],
		};

		this.props.comments = [...this.comments, comment];

		return comment;
	}

	public getComment(commentId: string): CardComment {
		const comment = this.comments.find((c) => c.id === commentId);
		if (!comment) {
			throw new NotFoundException(`Comment '${commentId}' does not exist on this card`);
		}

		return comment;
	}

	/**
	 * Only the author edits their own text. A moderator can remove a comment but not rewrite it
	 * — putting words in someone's mouth under their name is worse than deleting.
	 */
	public editComment(commentId: string, userId: EntityId, text: string): CardComment {
		const comment = this.getComment(commentId);

		if (comment.userId !== userId) {
			throw new ForbiddenException('Only the author may edit a comment');
		}
		if (comment.deletedAt) {
			throw new UnprocessableEntityException('A removed comment cannot be edited');
		}

		comment.text = text;
		comment.updatedAt = new Date();
		this.props.comments = [...this.comments];

		return comment;
	}

	public removeComment(commentId: string, userId: EntityId, asModerator: boolean): CardComment {
		const comment = this.getComment(commentId);

		if (comment.userId !== userId && !asModerator) {
			throw new ForbiddenException('Only the author or a moderator may remove a comment');
		}

		comment.deletedAt = new Date();
		comment.deletedByModerator = comment.userId !== userId;
		comment.text = '';
		comment.reports = [];
		this.props.comments = [...this.comments];

		return comment;
	}

	public reportComment(commentId: string, userId: EntityId, reason?: string): CardComment {
		const comment = this.getComment(commentId);

		if (comment.deletedAt) {
			throw new UnprocessableEntityException('A removed comment cannot be reported');
		}
		if (comment.userId === userId) {
			throw new UnprocessableEntityException('A comment cannot be reported by its own author');
		}

		// Reporting twice is a no-op rather than an error: from the reporter's side nothing
		// about the situation has changed, and a second report should not inflate the count.
		if (!comment.reports.some((report) => report.userId === userId)) {
			comment.reports = [...comment.reports, { userId, reason, createdAt: new Date() }];
			this.props.comments = [...this.comments];
		}

		return comment;
	}

	public canHaveChild(childNode: AnyBoardNode): boolean {
		return isContentElement(childNode);
	}
}

export const isCard = (reference: unknown): reference is Card => reference instanceof Card;
