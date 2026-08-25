import type { EntityId } from '@shared/domain/types';
import type { CardReactionType } from './card-reaction';

/**
 * Who a card or element response is being built for. Most of a board looks the same for
 * everyone, but the interactive parts do not: a poll reports the requesting user's own ballot
 * and may withhold the tally, a card reports that user's own reaction. Absent context
 * therefore means "no personal state, no results" — the safe reading for the shared payloads
 * that go out to a whole board room.
 */
export interface BoardViewContext {
	userId?: EntityId;
	canEdit?: boolean;
	/** The reaction kind the board is configured for; absent means reactions are off. */
	reactionType?: CardReactionType;
	commentsEnabled?: boolean;
	/** Whether this user may remove other people's comments. */
	canModerate?: boolean;
	/** Display names for the comment authors on the cards being mapped. */
	authorNames?: Map<EntityId, string>;
}
