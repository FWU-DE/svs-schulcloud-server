import { ContentElementType, ChecklistElement } from '../../domain';
import { ChecklistElementContent, ChecklistElementResponse, ChecklistItemResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class ChecklistElementResponseMapper implements BaseResponseMapper {
	private static instance: ChecklistElementResponseMapper;

	public static getInstance(): ChecklistElementResponseMapper {
		if (!ChecklistElementResponseMapper.instance) {
			ChecklistElementResponseMapper.instance = new ChecklistElementResponseMapper();
		}

		return ChecklistElementResponseMapper.instance;
	}

	public mapToResponse(element: ChecklistElement): ChecklistElementResponse {
		return new ChecklistElementResponse({
			id: element.id,
			type: ContentElementType.CHECKLIST,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new ChecklistElementContent({
				title: element.title,
				items: element.items.map(
					(item) => new ChecklistItemResponse({ id: item.id, text: item.text, checked: item.checked })
				),
			}),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof ChecklistElement;
	}
}
