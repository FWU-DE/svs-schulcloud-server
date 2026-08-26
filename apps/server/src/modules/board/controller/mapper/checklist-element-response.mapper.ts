import { type BoardViewContext, ChecklistElement, ContentElementType } from '../../domain';
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

	public mapToResponse(element: ChecklistElement, context: BoardViewContext = {}): ChecklistElementResponse {
		// Totals belong to whoever runs the list. Everyone else sees only their own ticks — a
		// personal checklist is there to help someone keep track, not to report on them.
		const showTotals = element.isPerUser && (context.canEdit ?? false);

		return new ChecklistElementResponse({
			id: element.id,
			type: ContentElementType.CHECKLIST,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new ChecklistElementContent({
				title: element.title,
				progressMode: element.progressMode,
				completedCount: element.completedCountFor(context.userId),
				participantCount: showTotals ? element.participantCount : undefined,
				items: element.items.map(
					(item) =>
						new ChecklistItemResponse({
							id: item.id,
							text: item.text,
							checked: element.isCheckedFor(item.id, context.userId),
							checkedCount: showTotals ? element.checkedCount(item.id) : undefined,
						})
				),
			}),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof ChecklistElement;
	}
}
