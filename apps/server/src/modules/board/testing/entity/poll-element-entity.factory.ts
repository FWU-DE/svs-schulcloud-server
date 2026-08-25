import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type PollElementProps, PollResultVisibility, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const pollElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<PollElementProps>>(
	({ sequence }) => {
		return {
			id: new ObjectId().toHexString(),
			path: ROOT_PATH,
			level: 0,
			position: 0,
			children: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			type: BoardNodeType.POLL_ELEMENT,
			question: `poll question #${sequence}`,
			pollOptions: [
				{ id: new ObjectId().toHexString(), text: 'yes' },
				{ id: new ObjectId().toHexString(), text: 'no' },
			],
			anonymous: false,
			multipleChoice: false,
			closed: false,
			showResults: PollResultVisibility.ALWAYS,
			resultsReleased: false,
			votes: [],
			voterSalt: 'poll-test-salt',
		};
	}
);
