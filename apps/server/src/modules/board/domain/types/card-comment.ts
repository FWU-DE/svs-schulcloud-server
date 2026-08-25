/**
 * A comment on a card. Comments live on the card node rather than in a collection of their
 * own: a board's comments are always read together with the card they belong to, and the
 * card's lifetime is exactly the comment's lifetime.
 */
export interface CardComment {
	id: string;
	userId: string;
	text: string;
	createdAt: Date;
	updatedAt: Date;
	/**
	 * A removed comment keeps its place as a tombstone. A thread where replies suddenly answer
	 * nothing is harder to moderate than one that says a comment was removed.
	 */
	deletedAt?: Date;
	deletedByModerator?: boolean;
	reports: CardCommentReport[];
}

export interface CardCommentReport {
	userId: string;
	reason?: string;
	createdAt: Date;
}

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_REPORT_REASON_LENGTH = 500;
