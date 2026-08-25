import { type Card, type ElementViewContext } from '../../domain';
import { CardResponse, TimestampsResponse, VisibilitySettingsResponse } from '../dto';
import { ContentElementResponseFactory } from './content-element-response.factory';

export class CardResponseMapper {
	public static mapToResponse(card: Card, context?: ElementViewContext): CardResponse {
		const result = new CardResponse({
			id: card.id,
			title: card.title,
			backgroundColor: card.backgroundColor,
			height: card.height,
			elements: card.children.map((element) => ContentElementResponseFactory.mapToResponse(element, context)),
			visibilitySettings: new VisibilitySettingsResponse({}),
			timestamps: new TimestampsResponse({ lastUpdatedAt: card.updatedAt, createdAt: card.createdAt }),
		});
		return result;
	}
}
