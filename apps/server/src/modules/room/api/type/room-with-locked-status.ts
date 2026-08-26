import type { Room } from '@modules/room';
import { type RoomOperation } from '@modules/room-membership/authorization/room.rule';

export type RoomWithAllowedOperationsAndLockedStatus = {
	room: Room;
	allowedOperations: Record<RoomOperation, boolean>;
	isLocked: boolean;
	totalMembers: number;
	/** The boards of the room the user may see, drafts included for those who may see drafts. */
	boardCount: number;
};
