import { type BoardViewContext, type Card, CardReactionType } from '../../domain';
import { CardReactionsResponse, CardResponse, TimestampsResponse, VisibilitySettingsResponse } from '../dto';
import { CardCommentResponseMapper } from './card-comment-response.mapper';
import { ContentElementResponseFactory } from './content-element-response.factory';

export class CardResponseMapper {
	public static mapToResponse(card: Card, context?: BoardViewContext): CardResponse {
		const result = new CardResponse({
			id: card.id,
			title: card.title,
			backgroundColor: card.backgroundColor,
			height: card.height,
			elements: card.children.map((element) => ContentElementResponseFactory.mapToResponse(element, context)),
			visibilitySettings: new VisibilitySettingsResponse({}),
			timestamps: new TimestampsResponse({ lastUpdatedAt: card.updatedAt, createdAt: card.createdAt }),
			reactions: this.mapReactions(card, context),
			commentsEnabled: card.commentsEnabled ?? null,
			readersCanEdit: card.readersCanEdit ?? null,
			comments: context?.commentsEnabled
				? CardCommentResponseMapper.mapListToResponse(card.comments, context)
				: undefined,
		});
		return result;
	}

	/**
	 * Reactions are reported as totals plus the requesting user's own value — never as a list of
	 * who reacted. A card is not a place where a class should be able to read off who liked whom.
	 */
	private static mapReactions(card: Card, context?: BoardViewContext): CardReactionsResponse | undefined {
		const type = context?.reactionType ?? CardReactionType.NONE;
		if (type === CardReactionType.NONE) {
			return undefined;
		}

		const reactions = card.reactions;

		return new CardReactionsResponse({
			type,
			count: reactions.length,
			sum: reactions.reduce((total, reaction) => total + reaction.value, 0),
			ownValue: context?.userId ? card.getReactionOf(context.userId) : undefined,
		});
	}
}
