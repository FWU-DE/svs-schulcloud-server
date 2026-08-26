import { ErrorLogger } from '@infra/logger';
import { ICurrentUser } from '@infra/auth-guard';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthorizationService } from '@modules/authorization';
import { BoardExternalReferenceType, BoardNodeAuthorizableService, ColumnBoardService } from '@modules/board';
import { BoardNodeRule } from '@modules/board/authorisation/board-node.rule';
import { CourseUc } from '@modules/course/api';
import { CreateCourseBodyParams } from '@modules/course/api/dto/create-course-body.params';
import { CreateCourseDto } from '@modules/course/api/dto/create-course.dto';
import { Injectable } from '@nestjs/common';
import { PaginationParams } from '@shared/controller/dto';
import { z } from 'zod';
import { asBodyParams, McpToolGroup, textResult } from './tool-support';

@Injectable()
export class CourseTools extends McpToolGroup {
	constructor(
		private readonly courseUc: CourseUc,
		private readonly columnBoardService: ColumnBoardService,
		private readonly boardNodeAuthorizableService: BoardNodeAuthorizableService,
		private readonly boardNodeRule: BoardNodeRule,
		private readonly authorizationService: AuthorizationService,
		errorLogger: ErrorLogger
	) {
		super(errorLogger);
	}

	public register(server: McpServer, user: ICurrentUser): void {
		this.tool(
			server,
			'list_courses',
			{
				title: 'List courses',
				description: 'List the courses the current user participates in.',
				inputSchema: {
					limit: z.number().int().positive().max(100).optional(),
					skip: z.number().int().nonnegative().optional(),
				},
			},
			async (args) => {
				const { limit, skip } = args as { limit?: number; skip?: number };
				const pagination = { skip, limit } as PaginationParams;
				const [courses, total] = await this.courseUc.findAllByUser(user.userId, user.schoolId, pagination);
				const data = courses.map((course) => {
					return { id: course.id, name: course.name, color: course.color };
				});

				return textResult({ total, data });
			}
		);

		this.tool(
			server,
			'get_course',
			{
				title: 'Get course',
				description: 'Get a single course the current user can access.',
				inputSchema: { courseId: z.string().min(1) },
			},
			async (args) => {
				const { courseId } = args as { courseId: string };
				// Authorization: resolves the user's role for this course and throws if they cannot access it.
				await this.courseUc.getUserPermissionByCourseId(user.userId, courseId);
				const course = await this.courseUc.findCourseById(courseId);

				return textResult({ id: course.id, name: course.name, color: course.color });
			}
		);

		this.tool(
			server,
			'create_course',
			{
				title: 'Create course',
				description:
					'Create a new course taught by the current user. A course starts empty — use create_board to give it content.',
				inputSchema: { name: z.string().min(1), color: z.string().optional() },
			},
			async (args) => {
				const { name, color } = args as { name: string; color?: string };
				const body = await asBodyParams(CreateCourseBodyParams, { name, color });
				const course = await this.courseUc.createCourse(user, new CreateCourseDto(body));

				return textResult({ id: course.id, name: course.name, color: course.color });
			}
		);

		this.tool(
			server,
			'list_course_boards',
			{
				title: 'List course boards',
				description: 'List the boards of a course. Pass a board id to get_board to read its columns and cards.',
				inputSchema: { courseId: z.string().min(1) },
			},
			async (args) => {
				const { courseId } = args as { courseId: string };
				const data = await this.findVisibleCourseBoards(user.userId, courseId);

				return textResult({ total: data.length, data });
			}
		);
	}

	/**
	 * Courses have no equivalent of `RoomContentUc.getRoomBoards`: the web client reads a course's
	 * boards out of the legacy `/course-rooms/:id/board` DTO, which we deliberately do not pull into
	 * this module. So gate on course access first and then apply the same board-node rule the room
	 * variant applies, which is what keeps a draft board out of a student's list.
	 */
	private async findVisibleCourseBoards(
		userId: string,
		courseId: string
	): Promise<{ id: string; title: string; isVisible: boolean; layout: string }[]> {
		await this.courseUc.getUserPermissionByCourseId(userId, courseId);

		const boards = await this.columnBoardService.findByExternalReference(
			{ type: BoardExternalReferenceType.Course, id: courseId },
			0
		);
		const user = await this.authorizationService.getUserWithPermissions(userId);
		const authorizables = await this.boardNodeAuthorizableService.getBoardAuthorizables(boards);

		const result = boards
			.filter((board) => {
				const authorizable = authorizables.find((candidate) => candidate.boardNode.id === board.id);

				return authorizable ? this.boardNodeRule.can('findBoard', user, authorizable) : false;
			})
			.map((board) => {
				return { id: board.id, title: board.title, isVisible: board.isVisible, layout: board.layout };
			});

		return result;
	}
}
