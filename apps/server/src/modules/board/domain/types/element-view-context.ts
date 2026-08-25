import type { EntityId } from '@shared/domain/types';

/**
 * Who a content element response is being built for. Most elements look the same for
 * everyone, but a poll does not: it has to report the requesting user's own ballot and may
 * have to withhold the tally. Absent context therefore means "no personal state, no
 * results" — the safe reading for the shared payloads that go out to a whole board room.
 */
export interface ElementViewContext {
	userId?: EntityId;
	canEdit?: boolean;
}
