import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type ChecklistElementProps, ChecklistProgressMode, ROOT_PATH } from '../domain';
import { ChecklistElement } from '../domain/checklist-element.do';

export const checklistElementFactory = BaseFactory.define<ChecklistElement, ChecklistElementProps>(ChecklistElement, ({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		title: `checklist #${sequence}`,
		progressMode: ChecklistProgressMode.SHARED,
		checks: [],
		items: [
			{ id: new ObjectId().toHexString(), text: 'first step', checked: false },
			{ id: new ObjectId().toHexString(), text: 'second step', checked: false },
		],
	};
});
