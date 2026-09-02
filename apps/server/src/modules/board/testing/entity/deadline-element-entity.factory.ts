import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type DeadlineElementProps, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const deadlineElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<DeadlineElementProps>>(
	({ sequence }) => {
		return {
			id: new ObjectId().toHexString(),
			path: ROOT_PATH,
			level: 0,
			position: 0,
			children: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			type: BoardNodeType.DEADLINE_ELEMENT,
			title: `deadline #${sequence}`,
			dueDate: undefined,
			showInCalendar: false,
		};
	}
);
