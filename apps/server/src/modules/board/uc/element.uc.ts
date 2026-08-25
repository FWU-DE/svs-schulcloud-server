import { Logger } from '@infra/logger';
import { AuthorizationService } from '@modules/authorization';
import { BoardContextApiHelperService } from '@modules/board-context';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { throwForbiddenIfFalse } from '@shared/common/utils';
import { EntityId } from '@shared/domain/types';
import { BoardNodeRule } from '../authorisation/board-node.rule';
import { AnyElementContentBody } from '../controller/dto';
import {
	AnyContentElement,
	BoardNodeFactory,
	type ChecklistElement,
	ContentElementWithParentHierarchy,
	type BoardViewContext,
	isChecklistElement,
	isPollElement,
	PollElement,
} from '../domain';
import { BoardNodeAuthorizableService, BoardNodeService } from '../service';

@Injectable()
export class ElementUc {
	constructor(
		private readonly authorizationService: AuthorizationService,
		private readonly boardNodeAuthorizableService: BoardNodeAuthorizableService,
		private readonly boardNodeService: BoardNodeService,
		private readonly boardNodeFactory: BoardNodeFactory,
		private readonly boardContextApiHelperService: BoardContextApiHelperService,
		private readonly logger: Logger,
		private readonly boardNodeRule: BoardNodeRule
	) {
		this.logger.setContext(ElementUc.name);
	}

	public async getElementWithParentHierarchy(
		userId: EntityId,
		elementId: EntityId
	): Promise<ContentElementWithParentHierarchy> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);
		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('viewElement', user, boardNodeAuthorizable));

		const parentHierarchy = await this.boardContextApiHelperService.getParentsOfElement(element.rootId);
		const viewContext: BoardViewContext = {
			userId,
			canEdit: this.boardNodeRule.can('updateElement', user, boardNodeAuthorizable),
		};

		return { element, parentHierarchy, viewContext };
	}

	/**
	 * Voting is deliberately not an element update: it needs read access to the board, not write
	 * access, so that readers can answer a poll they are not allowed to edit.
	 */
	public async voteInPoll(
		userId: EntityId,
		elementId: EntityId,
		optionIds: string[]
	): Promise<{ element: PollElement; viewContext: BoardViewContext }> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);

		if (!isPollElement(element)) {
			throw new UnprocessableEntityException(`Element '${elementId}' is not a poll`);
		}

		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('voteInPoll', user, boardNodeAuthorizable));

		await this.boardNodeService.voteInPoll(element, userId, optionIds);

		const viewContext: BoardViewContext = {
			userId,
			canEdit: this.boardNodeRule.can('updateElement', user, boardNodeAuthorizable),
		};

		return { element, viewContext };
	}

	public async updateElement(
		userId: EntityId,
		elementId: EntityId,
		content: AnyElementContentBody
	): Promise<AnyContentElement> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);
		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('updateElement', user, boardNodeAuthorizable));

		await this.boardNodeService.updateContent(element, content);

		return element;
	}

	/**
	 * Ticking a shared checklist item, like voting, needs read access rather than write access:
	 * the point is that participants can record progress on a board they may not edit.
	 */
	public async setChecklistItemChecked(
		userId: EntityId,
		elementId: EntityId,
		itemId: string,
		checked: boolean
	): Promise<ChecklistElement> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);

		if (!isChecklistElement(element)) {
			throw new UnprocessableEntityException(`Element '${elementId}' is not a checklist`);
		}

		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('checkChecklistItem', user, boardNodeAuthorizable));

		await this.boardNodeService.setChecklistItemChecked(element, itemId, checked);

		return element;
	}

	public async deleteElement(userId: EntityId, elementId: EntityId): Promise<EntityId> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);
		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('deleteElement', user, boardNodeAuthorizable));

		const { rootId } = element; // needs to be captured before deletion
		await this.boardNodeService.delete(element);

		return rootId;
	}

	public async checkElementReadPermission(userId: EntityId, elementId: EntityId): Promise<void> {
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const element = await this.boardNodeService.findContentElementById(elementId);
		const boardNode = await this.boardNodeService.findRoot(element);
		const boardNodeAuthorizable = await this.boardNodeAuthorizableService.getBoardAuthorizable(boardNode);

		throwForbiddenIfFalse(this.boardNodeRule.can('viewElement', user, boardNodeAuthorizable));
	}
}
