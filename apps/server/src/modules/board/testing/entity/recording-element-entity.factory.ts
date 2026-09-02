import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type RecordingElementProps, RecordingMediaType, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const recordingElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<RecordingElementProps>>(
	({ sequence }) => {
		return {
			id: new ObjectId().toHexString(),
			path: ROOT_PATH,
			level: 0,
			position: 0,
			children: [],
			createdAt: new Date(),
			updatedAt: new Date(),
			type: BoardNodeType.RECORDING_ELEMENT,
			mediaType: RecordingMediaType.AUDIO,
			caption: `recording #${sequence}`,
		};
	}
);
