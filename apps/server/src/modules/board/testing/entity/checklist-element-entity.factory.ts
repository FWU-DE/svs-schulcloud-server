import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type ChecklistElementProps, ChecklistProgressMode, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const checklistElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<ChecklistElementProps>>(
	({ sequence }) => {
		return {
			id: new ObjectId().toHexString(),
			path: ROOT_PATH,
			level: 0,
			position: 0,
			children: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			type: BoardNodeType.CHECKLIST_ELEMENT,
			title: `checklist #${sequence}`,
			progressMode: ChecklistProgressMode.SHARED,
			checks: [],
			items: [
				{ id: new ObjectId().toHexString(), text: 'first step', checked: false },
				{ id: new ObjectId().toHexString(), text: 'second step', checked: false },
			],
		};
	}
);
