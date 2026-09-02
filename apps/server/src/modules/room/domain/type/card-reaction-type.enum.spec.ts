import { CardReactionType } from './card-reaction-type.enum';

/**
 * Mirror of the board module's enum — see the comment on the enum itself. Both sides pin
 * themselves to the same literal list rather than importing each other; the counterpart lives
 * in `modules/board/domain/types/card-reaction.spec.ts`.
 */
const EXPECTED_VALUES = ['none', 'like', 'star', 'vote'];

describe('CardReactionType', () => {
	describe('when the board module is the original', () => {
		it('should carry exactly these values, or a room default becomes unreadable', () => {
			expect(Object.values(CardReactionType).sort()).toEqual([...EXPECTED_VALUES].sort());
		});
	});
});
