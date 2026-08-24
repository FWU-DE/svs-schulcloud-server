import { AuthorizationService } from '@modules/authorization';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { FeatureDisabledLoggableException } from '@shared/common/loggable-exception';
import { throwForbiddenIfFalse } from '@shared/common/utils';
import { EntityId } from '@shared/domain/types';
import { BoardNodeRule } from '../authorisation/board-node.rule';
import { BOARD_CONFIG_TOKEN, BoardConfig } from '../board.config';
import { AnyBoardNode, Card, Column } from '../domain';
import { BoardAiCard, BoardAiCardsService, BoardAiPreset } from '../service/board-ai-cards.service';
import { BoardNodeAuthorizableService, BoardNodeService } from '../service';

@Injectable()
export class BoardAiUc {
	constructor(
		@Inject(forwardRef(() => AuthorizationService))
		private readonly authorizationService: AuthorizationService,
		@Inject(BOARD_CONFIG_TOKEN) private readonly config: BoardConfig,
		private readonly boardNodeAuthorizableService: BoardNodeAuthorizableService,
		private readonly boardNodeService: BoardNodeService,
		private readonly boardNodeRule: BoardNodeRule,
		private readonly boardAiCardsService: BoardAiCardsService
	) {}

	/**
	 * The checks run on the first item, before the controller starts to stream, so that a rejected
	 * request still ends up as an ordinary http error.
	 */
	public async *suggestCardsForCard(
		userId: EntityId,
		cardId: EntityId,
		preset: BoardAiPreset,
		prompt?: string
	): AsyncGenerator<BoardAiCard> {
		const card = await this.boardNodeService.findByClassAndId(Card, cardId, 1);
		await this.checkMayAddCards(userId, card);

		yield* this.boardAiCardsService.generate([card], preset, prompt);
	}

	public async *suggestCardsForColumn(
		userId: EntityId,
		columnId: EntityId,
		preset: BoardAiPreset,
		prompt?: string
	): AsyncGenerator<BoardAiCard> {
		const column = await this.boardNodeService.findByClassAndId(Column, columnId, 2);
		await this.checkMayAddCards(userId, column);

		yield* this.boardAiCardsService.generate([...column.children], preset, prompt);
	}

	/**
	 * The suggestion always ends in new cards next to the source, so the right question is not
	 * whether the user may read it but whether they may add cards there.
	 */
	private async checkMayAddCards(userId: EntityId, node: AnyBoardNode): Promise<void> {
		if (!this.config.featureBoardAiCardsEnabled) {
			throw new FeatureDisabledLoggableException('FEATURE_BOARD_AI_CARDS_ENABLED');
		}
		if (!this.boardAiCardsService.isConfigured()) {
			throw new FeatureDisabledLoggableException('AI_SUGGESTION_API_KEY');
		}

		const user = await this.authorizationService.getUserWithPermissions(userId);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(node);

		throwForbiddenIfFalse(this.boardNodeRule.can('createCard', user, boardNodeAuthorizable));
	}
}
