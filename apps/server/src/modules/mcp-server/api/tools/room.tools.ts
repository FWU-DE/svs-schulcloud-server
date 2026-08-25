import { ErrorLogger } from '@infra/logger';
import { ICurrentUser } from '@infra/auth-guard';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RoomUc } from '@modules/room/api';
import { RoomArrangementUc } from '@modules/room/api/room-arrangement.uc';
import { CreateRoomBodyParams } from '@modules/room/api/dto/request/create-room.body.params';
import { UpdateRoomBodyParams } from '@modules/room/api/dto/request/update-room.body.params';
import { RoomContentUc } from '@modules/room/api/room-content.uc';
import { RoomColor, RoomFeatures } from '@modules/room/domain/type';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { asBodyParams, McpToolGroup, textResult } from './tool-support';

const roomShape = {
	name: z.string().min(1).max(100),
	color: z.nativeEnum(RoomColor),
	features: z.array(z.nativeEnum(RoomFeatures)).optional(),
};

@Injectable()
export class RoomTools extends McpToolGroup {
	constructor(
		private readonly roomUc: RoomUc,
		private readonly roomArrangementUc: RoomArrangementUc,
		private readonly roomContentUc: RoomContentUc,
		errorLogger: ErrorLogger
	) {
		super(errorLogger);
	}

	public register(server: McpServer, user: ICurrentUser): void {
		this.tool(
			server,
			'list_rooms',
			{
				title: 'List rooms',
				description: 'List the rooms the current user is a member of, in the order the user arranged them.',
				inputSchema: {},
			},
			async () => {
				// The same use-case GET /rooms uses. `RoomUc.getRoomStats` looks like the list tool wants
				// it, but it is the school-admin view and needs SCHOOL_ADMINISTRATE_ROOMS.
				const rooms = await this.roomArrangementUc.getRoomsByUserArrangement(user.userId);
				const data = rooms.map(({ room, isLocked, totalMembers }) => {
					return { id: room.id, name: room.name, color: room.color, isLocked, totalMembers };
				});

				return textResult({ total: data.length, data });
			}
		);

		this.tool(
			server,
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

		this.tool(
			server,
			'create_room',
			{
				title: 'Create room',
				description:
					'Create a new room owned by the current user. A room starts empty — use create_board to give it content.',
				inputSchema: roomShape,
			},
			async (args) => {
				const { name, color, features } = args as { name: string; color: RoomColor; features?: RoomFeatures[] };
				const props = await asBodyParams(CreateRoomBodyParams, { name, color, features: features ?? [] });
				const room = await this.roomUc.createRoom(user.userId, props);

				return textResult(room);
			}
		);

		this.tool(
			server,
			'update_room',
			{
				title: 'Update room',
				description: 'Update a room (name, colour, features). Requires edit permission on the room.',
				inputSchema: { roomId: z.string().min(1), ...roomShape },
			},
			async (args) => {
				const { roomId, name, color, features } = args as {
					roomId: string;
					name: string;
					color: RoomColor;
					features?: RoomFeatures[];
				};
				const props = await asBodyParams(UpdateRoomBodyParams, { name, color, features: features ?? [] });
				const { room, allowedOperations } = await this.roomUc.updateRoom(user.userId, roomId, props);

				return textResult({ room, allowedOperations });
			}
		);

		this.tool(
			server,
			'list_room_boards',
			{
				title: 'List room boards',
				description: 'List the boards of a room. Pass a board id to get_board to read its columns and cards.',
				inputSchema: { roomId: z.string().min(1) },
			},
			async (args) => {
				const { roomId } = args as { roomId: string };
				const boards = await this.roomContentUc.getRoomBoards(user.userId, roomId);
				// Deliberately without `allowedOperations`: that is thirty booleans per board, and
				// get_board answers the same question for the one board that is actually of interest.
				const data = boards.map(({ board }) => {
					return { id: board.id, title: board.title, isVisible: board.isVisible, layout: board.layout };
				});

				return textResult({ total: data.length, data });
			}
		);
	}
}
