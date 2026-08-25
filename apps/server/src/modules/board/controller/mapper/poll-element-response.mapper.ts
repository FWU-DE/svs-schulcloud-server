import { ContentElementType, type BoardViewContext, PollElement, PollResultVisibility } from '../../domain';
import { PollElementContent, PollElementResponse, PollOptionResponse, TimestampsResponse } from '../dto';
import type { BaseResponseMapper } from './base-mapper.interface';

export class PollElementResponseMapper implements BaseResponseMapper {
	private static instance: PollElementResponseMapper;

	public static getInstance(): PollElementResponseMapper {
		if (!PollElementResponseMapper.instance) {
			PollElementResponseMapper.instance = new PollElementResponseMapper();
		}

		return PollElementResponseMapper.instance;
	}

	public mapToResponse(element: PollElement, context: BoardViewContext = {}): PollElementResponse {
		const ownVote = context.userId ? element.getVoteOf(context.userId) : [];
		const resultsVisible = this.areResultsVisible(element, ownVote.length > 0, context.canEdit ?? false);

		const counts = new Map(element.getResults().map((result) => [result.optionId, result.count]));
		const votersByOption = resultsVisible && !element.anonymous ? element.getVotersByOption() : {};

		const options = element.pollOptions.map(
			(option) =>
				new PollOptionResponse({
					id: option.id,
					text: option.text,
					count: resultsVisible ? (counts.get(option.id) ?? 0) : undefined,
					voterIds: votersByOption[option.id],
				})
		);

		const result = new PollElementResponse({
			id: element.id,
			type: ContentElementType.POLL,
			timestamps: new TimestampsResponse({ lastUpdatedAt: element.updatedAt, createdAt: element.createdAt }),
			content: new PollElementContent({
				question: element.question,
				options,
				anonymous: element.anonymous,
				multipleChoice: element.multipleChoice,
				closed: element.closed,
				showResults: element.showResults,
				resultsReleased: element.resultsReleased,
				resultsVisible,
				voterCount: resultsVisible ? element.voterCount : undefined,
				ownVote,
			}),
		});

		return result;
	}

	public canMap(element: unknown): boolean {
		return element instanceof PollElement;
	}

	private areResultsVisible(element: PollElement, hasVoted: boolean, canEdit: boolean): boolean {
		// Whoever may edit the poll owns it and always sees where it stands.
		if (canEdit) {
			return true;
		}

		if (element.showResults === PollResultVisibility.ALWAYS) {
			return true;
		}

		if (element.showResults === PollResultVisibility.AFTER_VOTE) {
			return hasVoted;
		}

		return element.resultsReleased;
	}
}
