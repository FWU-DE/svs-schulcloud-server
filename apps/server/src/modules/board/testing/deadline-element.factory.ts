import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type DeadlineElementProps, ROOT_PATH } from '../domain';
import { DeadlineElement } from '../domain/deadline-element.do';

export const deadlineElementFactory = BaseFactory.define<DeadlineElement, DeadlineElementProps>(DeadlineElement, ({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		title: `deadline #${sequence}`,
		dueDate: undefined,
		showInCalendar: false,
	};
});
