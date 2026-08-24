import { RegisterTimeoutConfig } from '@core/interceptor/register-timeout-config.decorator';
import { LoggerModule } from '@core/logger';
import { ConfigurationModule } from '@infra/configuration';
import { AiSuggestionModule } from '@modules/ai-suggestion';
import { AuthorizationModule } from '@modules/authorization';
import { CopyHelperModule } from '@modules/copy-helper';
import { CourseModule } from '@modules/course';
import { RoomMembershipModule } from '@modules/room-membership';
import { SagaModule } from '@modules/saga';
import { forwardRef, Module } from '@nestjs/common';
import { BoardContextApiHelperModule } from '../board-context';
import { RoomModule } from '../room';
import { BOARD_CONFIG_TOKEN, BoardConfig } from './board.config';
import { BoardModule } from './board.module';
import {
	BoardAiController,
	BoardController,
	BoardErrorReportController,
	CardController,
	ColumnController,
	ElementController,
} from './controller';
import { BoardAiCardsService } from './service/board-ai-cards.service';
import { CopyRoomBoardsStep } from './saga';
import { BOARD_TIMEOUT_CONFIG_TOKEN, BoardTimeoutConfig } from './timeout.config';
import { BoardAiUc } from './uc/board-ai.uc';
import { BoardErrorReportUc, BoardUc, CardUc, ColumnUc, ElementUc } from './uc';

@Module({
	imports: [
		ConfigurationModule.register(BOARD_CONFIG_TOKEN, BoardConfig),
		ConfigurationModule.register(BOARD_TIMEOUT_CONFIG_TOKEN, BoardTimeoutConfig),
		CopyHelperModule,
		CourseModule,
		BoardModule,
		AiSuggestionModule,
		LoggerModule,
		RoomMembershipModule,
		RoomModule,
		forwardRef(() => AuthorizationModule),
		BoardContextApiHelperModule,
		SagaModule,
	],
	controllers: [
		BoardAiController,
		BoardController,
		ColumnController,
		CardController,
		ElementController,
		BoardErrorReportController,
	],
	providers: [BoardUc, BoardAiUc, BoardAiCardsService, BoardErrorReportUc, ColumnUc, CardUc, ElementUc, CopyRoomBoardsStep],
	// Exported so the MCP server can drive board content through the same use-cases as the REST API.
	exports: [BoardUc, ColumnUc, CardUc, ElementUc],
})
@RegisterTimeoutConfig(BOARD_TIMEOUT_CONFIG_TOKEN)
export class BoardApiModule {}
