/**
 * What a reaction on a card means. The board picks one for all of its cards, the way Padlet
 * does — mixing kinds within a board would make the numbers on two cards incomparable.
 *
 * Grading is deliberately absent: a mark that every participant can read is an assessment
 * question, not a reaction, and it needs a permission and privacy story of its own.
 */
export enum CardReactionType {
	NONE = 'none',
	LIKE = 'like',
	STAR = 'star',
	VOTE = 'vote',
}

export interface CardReaction {
	userId: string;
	/** 1 for a like, 1..5 for stars, -1 or 1 for a vote. */
	value: number;
	createdAt: Date;
}

export interface CardReactionRange {
	min: number;
	max: number;
}

export const reactionRange = (type: CardReactionType): CardReactionRange => {
	switch (type) {
		case CardReactionType.STAR:
			return { min: 1, max: 5 };
		case CardReactionType.VOTE:
			return { min: -1, max: 1 };
		default:
			return { min: 1, max: 1 };
	}
};
