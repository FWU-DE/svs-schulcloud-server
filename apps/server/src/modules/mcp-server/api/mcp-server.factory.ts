import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ICurrentUser } from '@infra/auth-guard';
import { CourseUc } from '@modules/course/api';
import { CreateCourseDto } from '@modules/course/api/dto/create-course.dto';
import { RoomUc } from '@modules/room/api';
import { CreateRoomBodyParams } from '@modules/room/api/dto/request/create-room.body.params';
import { UpdateRoomBodyParams } from '@modules/room/api/dto/request/update-room.body.params';
import { RoomColor, RoomFeatures } from '@modules/room/domain/type';
import { Injectable } from '@nestjs/common';
import { PaginationParams } from '@shared/controller/dto';
import { z } from 'zod';

const SERVER_INFO = { name: 'schulcloud-mcp', version: '0.1.0' };

/** Domain objects expose `getProps()`; entities serialize directly. Keep tool output JSON-friendly. */
function serialize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(serialize);
	}
	if (value && typeof value === 'object') {
		const candidate = value as { getProps?: () => unknown };
		if (typeof candidate.getProps === 'function') {
			return candidate.getProps();
		}
	}
	return value;
}

function textResult(value: unknown): { content: { type: 'text'; text: string }[] } {
	return { content: [{ type: 'text', text: JSON.stringify(serialize(value), null, 2) }] };
}

/**
 * Builds a per-request `McpServer` whose tools are bound to a specific authenticated user.
 * Every tool calls the same use-cases as the REST API, so authorization is unchanged.
 */
@Injectable()
export class McpServerFactory {
	constructor(
		private readonly roomUc: RoomUc,
		private readonly courseUc: CourseUc
	) {}

	public build(currentUser: ICurrentUser): McpServer {
		const server = new McpServer(SERVER_INFO);
		this.registerRoomTools(server, currentUser);
		this.registerCourseTools(server, currentUser);
		return server;
	}

	private registerRoomTools(server: McpServer, user: ICurrentUser): void {
		server.registerTool(
			'list_rooms',
			{
				title: 'List rooms',
				description: 'List the rooms the current user can access, including membership statistics.',
				inputSchema: {
					limit: z.number().int().positive().max(100).optional(),
					skip: z.number().int().nonnegative().optional(),
				},
			},
			async (args) => {
				const { limit, skip } = args as { limit?: number; skip?: number };
				const page = await this.roomUc.getRoomStats(user.userId, { pagination: { skip, limit } });
				return textResult({ total: page.total, data: page.data });
			}
		);

		server.registerTool(
			'get_room',
			{
				title: 'Get room',
				description: "Get a single room by id and the current user's allowed operations on it.",
				inputSchema: { roomId: z.string().min(1) },
			},
			async (args) => {
				const { roomId } = args as { roomId: string };
				const { room, allowedOperations } = await this.roomUc.getSingleRoom(user.userId, roomId);
				return textResult({ room, allowedOperations });
			}
		);

		server.registerTool(
			'create_room',
			{
				title: 'Create room',
				description: 'Create a new room owned by the current user.',
				inputSchema: {
					name: z.string().min(1).max(100),
					color: z.nativeEnum(RoomColor),
					features: z.array(z.nativeEnum(RoomFeatures)).optional(),
				},
			},
			async (args) => {
				const { name, color, features } = args as { name: string; color: RoomColor; features?: RoomFeatures[] };
				const props: CreateRoomBodyParams = { name, color, features: features ?? [] };
				const room = await this.roomUc.createRoom(user.userId, props);
				return textResult(room);
			}
		);

		server.registerTool(
			'update_room',
			{
				title: 'Update room',
				description: 'Update a room (name, colour, features). Requires edit permission on the room.',
				inputSchema: {
					roomId: z.string().min(1),
					name: z.string().min(1).max(100),
					color: z.nativeEnum(RoomColor),
					features: z.array(z.nativeEnum(RoomFeatures)).optional(),
				},
			},
			async (args) => {
				const { roomId, name, color, features } = args as {
					roomId: string;
					name: string;
					color: RoomColor;
					features?: RoomFeatures[];
				};
				const props: UpdateRoomBodyParams = { name, color, features: features ?? [] };
				const { room, allowedOperations } = await this.roomUc.updateRoom(user.userId, roomId, props);
				return textResult({ room, allowedOperations });
			}
		);
	}

	private registerCourseTools(server: McpServer, user: ICurrentUser): void {
		server.registerTool(
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

		server.registerTool(
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

		server.registerTool(
			'create_course',
			{
				title: 'Create course',
				description: 'Create a new course taught by the current user.',
				inputSchema: { name: z.string().min(1), color: z.string().optional() },
			},
			async (args) => {
				const { name, color } = args as { name: string; color?: string };
				const course = await this.courseUc.createCourse(user, new CreateCourseDto({ name, color }));
				return textResult({ id: course.id, name: course.name, color: course.color });
			}
		);
	}
}
