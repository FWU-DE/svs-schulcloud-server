export enum PollResultVisibility {
	/** Everyone sees the tally from the start. */
	ALWAYS = 'always',
	/** A participant sees the tally once they have cast their own ballot. */
	AFTER_VOTE = 'afterVote',
	/** Nobody sees the tally until someone who may edit the poll releases it. */
	ON_RELEASE = 'onRelease',
}

export interface PollOption {
	id: string;
	text: string;
}

/**
 * A single ballot. Exactly one of `userId` / `voterHash` is set: an open poll stores the
 * voter, an anonymous poll stores only an HMAC of the voter over a per-element salt. The
 * hash is enough to recognise a repeat vote and to show voters their own ballot, but it
 * carries no name — dropping `voterSalt` makes the remaining ballots unattributable.
 */
export interface PollVote {
	optionIds: string[];
	userId?: string;
	voterHash?: string;
	createdAt: Date;
}

export interface PollResult {
	optionId: string;
	count: number;
}
