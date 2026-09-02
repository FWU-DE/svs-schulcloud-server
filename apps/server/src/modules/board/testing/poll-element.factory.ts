import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type PollElementProps, PollResultVisibility, ROOT_PATH } from '../domain';
import { PollElement } from '../domain/poll-element.do';

export const pollElementFactory = BaseFactory.define<PollElement, PollElementProps>(PollElement, ({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		question: `Poll question #${sequence}`,
		pollOptions: [
			{ id: new ObjectId().toHexString(), text: 'Option A' },
			{ id: new ObjectId().toHexString(), text: 'Option B' },
		],
		anonymous: false,
		multipleChoice: false,
		closed: false,
		showResults: PollResultVisibility.ALWAYS,
		resultsReleased: false,
		votes: [],
		voterSalt: 'test-salt',
	};
});
