import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type CodeElementProps, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const codeElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<CodeElementProps>>(({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		type: BoardNodeType.CODE_ELEMENT,
		code: `const answer = ${sequence};`,
		language: 'javascript',
		showLineNumbers: false,
		syntaxHighlighting: true,
	};
});
