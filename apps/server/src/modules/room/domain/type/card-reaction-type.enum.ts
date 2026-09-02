/**
 * Mirrors `CardReactionType` of the board module. It is duplicated rather than imported
 * because a room must not depend on the board module — the room only stores which kind its
 * boards should default to, and the board module is what gives the value meaning.
 *
 * Kept in sync by `card-reaction-type.enum.spec.ts`, which fails if the two drift apart.
 */
export enum CardReactionType {
	NONE = 'none',
	LIKE = 'like',
	STAR = 'star',
	VOTE = 'vote',
}
