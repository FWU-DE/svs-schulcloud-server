import { AuthorizationService } from '@modules/authorization';
import { Injectable } from '@nestjs/common';
import { FeatureDisabledLoggableException } from '@shared/common/loggable-exception';
import { Permission } from '@shared/domain/interface';
import { EntityId } from '@shared/domain/types';
import { RoomAiTemplateBodyParams } from './dto/request/room-ai-template.body.params';
import { RoomAiTemplateItem, RoomAiTemplateService } from './service/room-ai-template.service';
import { RoomPermissionService } from './service/room-permission.service';

@Injectable()
export class RoomAiTemplateUc {
	constructor(
		private readonly authorizationService: AuthorizationService,
		private readonly roomPermissionService: RoomPermissionService,
		private readonly roomAiTemplateService: RoomAiTemplateService
	) {}

	/**
	 * The checks run on the first item, before the controller starts to stream, so that a rejected
	 * request still ends up as an ordinary http error.
	 */
	public async *generateTemplate(
		userId: EntityId,
		params: RoomAiTemplateBodyParams
	): AsyncGenerator<RoomAiTemplateItem> {
		this.roomPermissionService.checkFeatureRoomAiTemplateEnabled();

		if (!this.roomAiTemplateService.isConfigured()) {
			throw new FeatureDisabledLoggableException('ROOM_AI_API_KEY');
		}

		const user = await this.authorizationService.getUserWithPermissions(userId);
		this.authorizationService.checkOneOfPermissions(user, [Permission.SCHOOL_CREATE_ROOM]);

		yield* this.roomAiTemplateService.generate(params.prompt, params.maxColumns);
	}
}
