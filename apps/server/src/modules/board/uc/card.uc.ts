import { LegacyLogger } from '@infra/logger';
import { AuthorizationService } from '@modules/authorization';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { FeatureDisabledLoggableException } from '@shared/common/loggable-exception';
import { EntityId } from '@shared/domain/types';

import { throwForbiddenIfFalse } from '@shared/common/utils';
import { BoardNodeRule } from '../authorisation/board-node.rule';
import { AnyContentElement, BoardNodeFactory, Card, Colors, ContentElementType, type ElementViewContext } from '../domain';
import { BOARD_CONFIG_TOKEN, BoardConfig } from '../board.config';
import { BoardNodeAuthorizableService, BoardNodeService } from '../service';

/** The element types behind FEATURE_COLUMN_BOARD_INTERACTIVE_ELEMENTS_ENABLED. */
const INTERACTIVE_ELEMENT_TYPES: ContentElementType[] = [ContentElementType.POLL];

/**
 * A card plus what its elements may show this particular user — see {@link ElementViewContext}.
 */
export interface CardWithViewContext {
	card: Card;
	viewContext: ElementViewContext;
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
					},
				});
			}
			return allowed;
		}, []);

		return allowedCards;
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
