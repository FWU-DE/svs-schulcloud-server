import { ContentElementType, DeadlineElement } from '../../domain';
import { DeadlineElementContent, DeadlineElementResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class DeadlineElementResponseMapper implements BaseResponseMapper {
	private static instance: DeadlineElementResponseMapper;

	public static getInstance(): DeadlineElementResponseMapper {
		if (!DeadlineElementResponseMapper.instance) {
			DeadlineElementResponseMapper.instance = new DeadlineElementResponseMapper();
		}

		return DeadlineElementResponseMapper.instance;
	}

	public mapToResponse(element: DeadlineElement): DeadlineElementResponse {
		return new DeadlineElementResponse({
			id: element.id,
			type: ContentElementType.DEADLINE,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new DeadlineElementContent({ title: element.title, dueDate: element.dueDate?.toISOString() ?? null }),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof DeadlineElement;
	}
}
