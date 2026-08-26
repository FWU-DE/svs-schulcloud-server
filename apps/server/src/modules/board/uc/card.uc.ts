import { ObjectId } from '@mikro-orm/mongodb';
import { AuthorizationService } from '@modules/authorization';
import { UserService } from '@modules/user';
import { type User } from '@modules/user/repo';
import { LegacyLogger } from '@infra/logger';
import { forwardRef, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { FeatureDisabledLoggableException } from '@shared/common/loggable-exception';
import { throwForbiddenIfFalse } from '@shared/common/utils';
import { sanitizeRichText } from '@shared/controller/transformer';
import { EntityId, InputFormat } from '@shared/domain/types';
import { BoardNodeRule } from '../authorisation/board-node.rule';
import { BOARD_CONFIG_TOKEN, BoardConfig } from '../board.config';
import {
	AnyContentElement,
	type BoardNodeAuthorizable,
	BoardNodeFactory,
	type BoardSettingsChain,
	type BoardViewContext,
	Card,
	type CardComment,
	CardReactionType,
	Colors,
	isCard,
	ContentElementType,
	isColumn,
	isColumnBoard,
	resolveCommentsEnabled,
	resolveReactionType,
} from '../domain';
import { BoardNodeAuthorizableService, BoardNodeService } from '../service';

/**
 * A card plus one of its comments and the context to render them in.
 */
export interface CardCommentWithContext {
	card: Card;
	comment: CardComment;
	viewContext: BoardViewContext;
}

/** Comments are a board-wide setting, so the flag is read off the card's root board. */
/**
 * The chain a card's settings are resolved along: the card itself, its column, its board and
 * the room the board hangs in. Every level may overrule the one above; the bottom is off.
 */
const settingsChainOf = (authorizable: BoardNodeAuthorizable): BoardSettingsChain => {
	const { boardNode, parentNode, rootNode, boardConfiguration } = authorizable;

	return {
		card: isCard(boardNode) ? boardNode : undefined,
		column: isColumn(parentNode) ? parentNode : undefined,
		board: isColumnBoard(rootNode) ? rootNode : undefined,
		roomCommentsEnabled: boardConfiguration.roomCommentsEnabled,
		roomReactionType: boardConfiguration.roomReactionType,
	};
};

const commentsEnabledOn = (authorizable: BoardNodeAuthorizable): boolean =>
	resolveCommentsEnabled(settingsChainOf(authorizable));

/**
 * Comments are plain text. Allowing markup would turn every card into a place where a link or
 * an image can be smuggled past the people who may not edit the board.
 */
const sanitizeComment = (text: string): string => sanitizeRichText(text, InputFormat.PLAIN_TEXT);

const reactionTypeOf = (authorizable: BoardNodeAuthorizable): CardReactionType =>
	resolveReactionType(settingsChainOf(authorizable));

/** The element types behind FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED. */
const INTERACTIVE_ELEMENT_TYPES: ContentElementType[] = [
	ContentElementType.POLL,
	ContentElementType.DEADLINE,
	ContentElementType.CODE,
	ContentElementType.FORMULA,
	ContentElementType.CHECKLIST,
	ContentElementType.RECORDING,
];

/**
 * A card plus what its elements may show this particular user — see {@link BoardViewContext}.
 */
export interface CardWithViewContext {
	card: Card;
	viewContext: BoardViewContext;
}

@Injectable()
export class CardUc {
	constructor(
		@Inject(forwardRef(() => AuthorizationService))
		private readonly authorizationService: AuthorizationService,
		private readonly boardNodeAuthorizableService: BoardNodeAuthorizableService,
		private readonly boardNodeService: BoardNodeService,
		private readonly boardNodeFactory: BoardNodeFactory,
		private readonly logger: LegacyLogger,
		private readonly boardNodeRule: BoardNodeRule,
		private readonly userService: UserService,
		@Inject(BOARD_CONFIG_TOKEN) private readonly boardConfig: BoardConfig
	) {
		this.logger.setContext(CardUc.name);
	}

	public async findCards(userId: EntityId, cardIds: EntityId[]): Promise<CardWithViewContext[]> {
		const cards = await this.boardNodeService.findByClassAndIds(Card, cardIds);
		if (cards.length === 0) {
			return [];
		}

		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardAuthorizables = await this.boardNodeAuthorizableService.getBoardAuthorizables(cards);

		const allowedCards = boardAuthorizables.reduce((allowed: CardWithViewContext[], boardNodeAuthorizable) => {
			if (this.boardNodeRule.can('findCards', user, boardNodeAuthorizable)) {
				allowed.push({
					card: boardNodeAuthorizable.boardNode as Card,
					viewContext: {
						userId,
						canEdit: this.boardNodeRule.can('updateElement', user, boardNodeAuthorizable),
						canModerate: this.boardNodeRule.can('moderateCardComments', user, boardNodeAuthorizable),
						reactionType: reactionTypeOf(boardNodeAuthorizable),
						commentsEnabled: commentsEnabledOn(boardNodeAuthorizable),
					},
				});
			}
			return allowed;
		}, []);

		const authorNames = await this.resolveAuthorNames(
			allowedCards.filter(({ viewContext }) => viewContext.commentsEnabled).map(({ card }) => card)
		);
		allowedCards.forEach(({ viewContext }) => {
			viewContext.authorNames = authorNames;
		});

		return allowedCards;
	}

	/**
	 * Reacting needs read access, not write access: the whole point is that participants who
	 * may not edit a card can still respond to it.
	 */
	public async reactToCard(userId: EntityId, cardId: EntityId, value?: number): Promise<CardWithViewContext> {
		if (!this.boardConfig.featureColumnBoardInteractiveElementsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED');
		}

		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('reactToCard', user, boardNodeAuthorizable));

		const reactionType = reactionTypeOf(boardNodeAuthorizable);
		if (reactionType === CardReactionType.NONE) {
			throw new UnprocessableEntityException('Reactions are turned off for this board');
		}

		await this.boardNodeService.reactToCard(card, userId, reactionType, value);

		return {
			card,
			viewContext: {
				userId,
				canEdit: this.boardNodeRule.can('updateElement', user, boardNodeAuthorizable),
				reactionType,
			},
		};
	}

	public async addComment(userId: EntityId, cardId: EntityId, text: string): Promise<CardCommentWithContext> {
		const { card, user, authorizable } = await this.loadCardForCommenting(userId, cardId, 'commentOnCard');

		const comment = card.addComment({ id: new ObjectId().toHexString(), userId, text: sanitizeComment(text) });
		await this.boardNodeService.saveCard(card);

		return { card, comment, viewContext: await this.buildCommentViewContext(userId, user, authorizable, card) };
	}

	public async editComment(
		userId: EntityId,
		cardId: EntityId,
		commentId: string,
		text: string
	): Promise<CardCommentWithContext> {
		const { card, user, authorizable } = await this.loadCardForCommenting(userId, cardId, 'commentOnCard');

		const comment = card.editComment(commentId, userId, sanitizeComment(text));
		await this.boardNodeService.saveCard(card);

		return { card, comment, viewContext: await this.buildCommentViewContext(userId, user, authorizable, card) };
	}

	public async removeComment(userId: EntityId, cardId: EntityId, commentId: string): Promise<CardCommentWithContext> {
		const { card, user, authorizable } = await this.loadCardForCommenting(userId, cardId, 'commentOnCard');

		const canModerate = this.boardNodeRule.can('moderateCardComments', user, authorizable);
		const comment = card.removeComment(commentId, userId, canModerate);
		await this.boardNodeService.saveCard(card);

		return { card, comment, viewContext: await this.buildCommentViewContext(userId, user, authorizable, card) };
	}

	public async reportComment(
		userId: EntityId,
		cardId: EntityId,
		commentId: string,
		reason?: string
	): Promise<CardCommentWithContext> {
		const { card, user, authorizable } = await this.loadCardForCommenting(userId, cardId, 'commentOnCard');

		const comment = card.reportComment(commentId, userId, reason);
		await this.boardNodeService.saveCard(card);

		return { card, comment, viewContext: await this.buildCommentViewContext(userId, user, authorizable, card) };
	}

	private async loadCardForCommenting(
		userId: EntityId,
		cardId: EntityId,
		operation: 'commentOnCard'
	): Promise<{ card: Card; user: User; authorizable: BoardNodeAuthorizable }> {
		if (!this.boardConfig.featureColumnBoardInteractiveElementsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED');
		}

		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const authorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can(operation, user, authorizable));

		if (!commentsEnabledOn(authorizable)) {
			throw new UnprocessableEntityException('Comments are turned off for this board');
		}

		return { card, user, authorizable };
	}

	private async buildCommentViewContext(
		userId: EntityId,
		user: User,
		authorizable: BoardNodeAuthorizable,
		card: Card
	): Promise<BoardViewContext> {
		return {
			userId,
			canEdit: this.boardNodeRule.can('updateElement', user, authorizable),
			canModerate: this.boardNodeRule.can('moderateCardComments', user, authorizable),
			reactionType: reactionTypeOf(authorizable),
			commentsEnabled: true,
			authorNames: await this.resolveAuthorNames([card]),
		};
	}

	/**
	 * One lookup for all comment authors across the cards being mapped: a class board tends to
	 * have many comments from few people, so deduplicating by author keeps this cheap.
	 */
	private async resolveAuthorNames(cards: Card[]): Promise<Map<EntityId, string>> {
		const authorIds = [...new Set(cards.flatMap((card) => card.comments.map((comment) => comment.userId)))];
		if (authorIds.length === 0) {
			return new Map();
		}

		const authors = await this.userService.findByIds(authorIds);
		const entries = await Promise.all(
			authors.map(async (author): Promise<[EntityId, string]> => [
				author.id ?? '',
				await this.userService.getDisplayName(author),
			])
		);

		return new Map(entries);
	}

	/**
	 * Puts a card's own settings above the board's, or back under them. Needs the same rights as
	 * editing the card: it changes what other people may do on it.
	 */
	public async updateCardSettings(
		userId: EntityId,
		cardId: EntityId,
		settings: {
			commentsEnabled?: boolean | null;
			readersCanEdit?: boolean | null;
			reactionType?: CardReactionType | null;
		}
	): Promise<CardWithViewContext> {
		if (!this.boardConfig.featureColumnBoardInteractiveElementsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED');
		}

		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const authorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateCardSettings', user, authorizable));

		if (settings.commentsEnabled !== undefined) {
			card.commentsEnabled = settings.commentsEnabled ?? undefined;
		}
		if (settings.readersCanEdit !== undefined) {
			card.readersCanEdit = settings.readersCanEdit ?? undefined;
		}
		if (settings.reactionType !== undefined) {
			card.reactionType = settings.reactionType ?? undefined;
		}
		await this.boardNodeService.saveCard(card);

		// Re-read the authorizable: the card may just have changed what this user may do on it.
		const updated = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		return {
			card,
			viewContext: {
				userId,
				canEdit: this.boardNodeRule.can('updateElement', user, updated),
				canModerate: this.boardNodeRule.can('moderateCardComments', user, updated),
				reactionType: reactionTypeOf(updated),
				commentsEnabled: commentsEnabledOn(updated),
				authorNames: await this.resolveAuthorNames([card]),
			},
		};
	}

	public async updateCardHeight(userId: EntityId, cardId: EntityId, height: number): Promise<Card> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateCardHeight', user, boardNodeAuthorizable));

		await this.boardNodeService.updateHeight(card, height);
		return card;
	}

	public async updateCardTitle(userId: EntityId, cardId: EntityId, title: string): Promise<Card> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateCardTitle', user, boardNodeAuthorizable));

		await this.boardNodeService.updateTitle(card, title);
		return card;
	}

	public async updateCardColor(userId: EntityId, cardId: EntityId, color: Colors): Promise<Card> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateCardColor', user, boardNodeAuthorizable));

		await this.boardNodeService.updateBackgroundColor(card, color);
		return card;
	}

	public async deleteCard(userId: EntityId, cardId: EntityId): Promise<EntityId> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);

		throwForbiddenIfFalse(this.boardNodeRule.can('deleteCard', user, boardNodeAuthorizable));

		const { rootId } = card; // needs to be captured before deletion
		await this.boardNodeService.delete(card);

		return rootId;
	}

	// --- elements ---

	public async createElement(
		userId: EntityId,
		cardId: EntityId,
		type: ContentElementType,
		toPosition?: number
	): Promise<AnyContentElement> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(card);
		const isVideoConferenceElement = type === ContentElementType.VIDEO_CONFERENCE;

		throwForbiddenIfFalse(this.boardNodeRule.can('createElement', user, boardNodeAuthorizable));

		if (INTERACTIVE_ELEMENT_TYPES.includes(type) && !this.boardConfig.featureColumnBoardInteractiveElementsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED');
		}

		if (isVideoConferenceElement) {
			throwForbiddenIfFalse(this.boardNodeRule.can('manageVideoConference', user, boardNodeAuthorizable));
		}

		const element = this.boardNodeFactory.buildContentElement(type);

		await this.boardNodeService.addToParent(card, element, toPosition);

		return element;
	}

	public async moveElement(
		userId: EntityId,
		elementId: EntityId,
		targetCardId: EntityId,
		targetPosition: number
	): Promise<AnyContentElement> {
		const element = await this.boardNodeService.findContentElementById(elementId);
		const targetCard = await this.boardNodeService.findByClassAndId(Card, targetCardId);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(targetCard);

		throwForbiddenIfFalse(this.boardNodeRule.can('moveElement', user, boardNodeAuthorizable));

		await this.boardNodeService.move(element, targetCard, targetPosition);

		return element;
	}
}
