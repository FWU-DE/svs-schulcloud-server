import { ObjectId } from '@mikro-orm/mongodb';
import { BaseFactory } from '@testing/factory/base.factory';
import { type FormulaElementProps, ROOT_PATH } from '../domain';
import { FormulaElement } from '../domain/formula-element.do';

export const formulaElementFactory = BaseFactory.define<FormulaElement, FormulaElementProps>(FormulaElement, ({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		latex: 'a^2 + b^2 = c^2',
	};
});
