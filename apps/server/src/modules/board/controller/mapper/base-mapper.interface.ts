import type { AnyBoardNode } from '../../domain';
import type { AnyContentElementResponse } from '../dto';
import type { BoardViewContext } from '../../domain';

export interface BaseResponseMapper<T = AnyBoardNode, U = AnyContentElementResponse> {
	mapToResponse(element: T, context?: BoardViewContext): U;

	canMap(element: T): boolean;
}
