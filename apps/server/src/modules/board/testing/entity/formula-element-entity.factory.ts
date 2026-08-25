import { ObjectId } from '@mikro-orm/mongodb';
import { BoardNodeType, type FormulaElementProps, ROOT_PATH } from '../../domain';
import { BoardNodeEntityFactory, type PropsWithType } from './board-node-entity.factory';

export const formulaElementEntityFactory = BoardNodeEntityFactory.define<PropsWithType<FormulaElementProps>>(({ sequence }) => {
	return {
		id: new ObjectId().toHexString(),
		path: ROOT_PATH,
		level: 0,
		position: 0,
		children: [],
		createdAt: new Date(),
		updatedAt: new Date(),
		type: BoardNodeType.FORMULA_ELEMENT,
		latex: 'a^2 + b^2 = c^2',
	};
});
