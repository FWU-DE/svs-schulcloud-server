import type { AnyBoardNode } from '../../domain';
import type { AnyContentElementResponse } from '../dto';
import type { ElementViewContext } from '../../domain';

export interface BaseResponseMapper<T = AnyBoardNode, U = AnyContentElementResponse> {
	mapToResponse(element: T, context?: ElementViewContext): U;

	canMap(element: T): boolean;
}
