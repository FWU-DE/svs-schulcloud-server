import { ContentElementType, FormulaElement } from '../../domain';
import { FormulaElementContent, FormulaElementResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class FormulaElementResponseMapper implements BaseResponseMapper {
	private static instance: FormulaElementResponseMapper;

	public static getInstance(): FormulaElementResponseMapper {
		if (!FormulaElementResponseMapper.instance) {
			FormulaElementResponseMapper.instance = new FormulaElementResponseMapper();
		}

		return FormulaElementResponseMapper.instance;
	}

	public mapToResponse(element: FormulaElement): FormulaElementResponse {
		return new FormulaElementResponse({
			id: element.id,
			type: ContentElementType.FORMULA,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new FormulaElementContent({ latex: element.latex }),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof FormulaElement;
	}
}
