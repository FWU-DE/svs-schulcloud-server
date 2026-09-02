import { type BoardViewContext, type CardComment } from '../../domain';
import { CardCommentResponse, TimestampsResponse } from '../dto';

export class CardCommentResponseMapper {
	public static mapToResponse(comment: CardComment, context: BoardViewContext = {}): CardCommentResponse {
		const isRemoved = comment.deletedAt !== undefined;

		return new CardCommentResponse({
			id: comment.id,
			// A removed comment keeps its place in the thread but not its text.
			text: isRemoved ? '' : comment.text,
			authorId: comment.userId,
			authorName: context.authorNames?.get(comment.userId) ?? '',
			isOwn: context.userId === comment.userId,
			isRemoved,
			removedByModerator: comment.deletedByModerator ?? false,
			isEdited: comment.updatedAt.getTime() !== comment.createdAt.getTime(),
			ownReport: context.userId !== undefined && comment.reports.some((report) => report.userId === context.userId),
			// Who reported whom stays between the reporter and the server; moderators see how
			// often, not by whom, so a report cannot become an accusation in the classroom.
			reportCount: context.canModerate ? comment.reports.length : undefined,
			timestamps: new TimestampsResponse({ createdAt: comment.createdAt, lastUpdatedAt: comment.updatedAt }),
		});
	}

	public static mapListToResponse(comments: CardComment[], context: BoardViewContext = {}): CardCommentResponse[] {
		return comments.map((comment) => this.mapToResponse(comment, context));
	}
}
