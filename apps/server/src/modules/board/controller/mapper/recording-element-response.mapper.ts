import { ContentElementType, RecordingElement } from '../../domain';
import { RecordingElementContent, RecordingElementResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class RecordingElementResponseMapper implements BaseResponseMapper {
	private static instance: RecordingElementResponseMapper;

	public static getInstance(): RecordingElementResponseMapper {
		if (!RecordingElementResponseMapper.instance) {
			RecordingElementResponseMapper.instance = new RecordingElementResponseMapper();
		}

		return RecordingElementResponseMapper.instance;
	}

	public mapToResponse(element: RecordingElement): RecordingElementResponse {
		return new RecordingElementResponse({
			id: element.id,
			type: ContentElementType.RECORDING,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new RecordingElementContent({ mediaType: element.mediaType, caption: element.caption }),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof RecordingElement;
	}
}
