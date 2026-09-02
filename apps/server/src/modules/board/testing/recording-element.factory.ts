import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type RecordingElementProps, RecordingMediaType, ROOT_PATH } from '../domain';
import { RecordingElement } from '../domain/recording-element.do';

export const recordingElementFactory = BaseFactory.define<RecordingElement, RecordingElementProps>(
	RecordingElement,
	({ sequence }) => {
		return {
			id: new ObjectId().toHexString(),
			path: ROOT_PATH,
			level: 0,
			position: 0,
			children: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			mediaType: RecordingMediaType.AUDIO,
			caption: `recording #${sequence}`,
		};
	}
);
