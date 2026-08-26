import { CardReactionType } from './card-reaction';

/**
 * The room module mirrors this enum, because a room stores which reaction kind its boards
 * default to but must not depend on this module. Both sides pin themselves to the same literal
 * list instead of importing each other — an import across the two would put a cycle into the
 * type graph, which silently degrades unrelated types on the other side to `any`.
 *
 * The counterpart lives in `modules/room/domain/type/card-reaction-type.enum.spec.ts`.
 */
const EXPECTED_VALUES = ['none', 'like', 'star', 'vote'];

describe('CardReactionType', () => {
	describe('when the room module mirrors it', () => {
		it('should carry exactly these values, or a room default becomes unreadable', () => {
			expect(Object.values(CardReactionType).sort()).toEqual([...EXPECTED_VALUES].sort());
		});
	});
});
