import { ContentElementType, CodeElement } from '../../domain';
import { CodeElementContent, CodeElementResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class CodeElementResponseMapper implements BaseResponseMapper {
	private static instance: CodeElementResponseMapper;

	public static getInstance(): CodeElementResponseMapper {
		if (!CodeElementResponseMapper.instance) {
			CodeElementResponseMapper.instance = new CodeElementResponseMapper();
		}

		return CodeElementResponseMapper.instance;
	}

	public mapToResponse(element: CodeElement): CodeElementResponse {
		return new CodeElementResponse({
			id: element.id,
			type: ContentElementType.CODE,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new CodeElementContent({
				code: element.code,
				language: element.language,
				showLineNumbers: element.showLineNumbers,
				syntaxHighlighting: element.syntaxHighlighting,
			}),
		});
	}

	public canMap(element: unknown): boolean {
		return element instanceof CodeElement;
	}
}
