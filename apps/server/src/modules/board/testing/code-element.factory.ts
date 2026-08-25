import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type CodeElementProps, ROOT_PATH } from '../domain';
import { CodeElement } from '../domain/code-element.do';

export const codeElementFactory = BaseFactory.define<CodeElement, CodeElementProps>(CodeElement, ({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		code: `const answer = ${sequence};`,
		language: 'javascript',
	};
});
