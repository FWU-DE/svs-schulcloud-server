import { AuthorizationService } from '@modules/authorization';
import { CourseService } from '@modules/course';
import { RoleName } from '@modules/role';
import { RoomService } from '@modules/room';
import { RoomAuthorizable, RoomMembershipService, RoomRule, UserWithRoomRoles } from '@modules/room-membership';
import { UserDo, UserService } from '@modules/user';
import { Injectable } from '@nestjs/common';
import { EntityId } from '@shared/domain/types';

export enum QuickSearchResultType {
	ROOM = 'room',
	COURSE = 'course',
	PERSON = 'person',
}

export interface QuickSearchResult {
	id: EntityId;
	type: QuickSearchResultType;
	title: string;
	subtitle: string;
	url: string;
}

/**
 * How many rooms, courses and people are looked at before the query is applied. The search runs
 * over what the user is a member of anyway, so this is a ceiling for pathological accounts, not a
 * page size.
 */
const SCAN_LIMIT = 200;

/**
 * "Ökosystem" and "Okosystem" should find each other, and a teacher typing "muller" should find
 * Müller. Comparing the decomposed form with the combining marks stripped gets both.
 */
const fold = (value: string): string =>
	value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

/**
 * Nothing (0) when the query does not occur at all, otherwise how good the hit is: a title
 * beginning with the query beats a word beginning with it, which beats an occurrence in the middle.
 * The caller sorts on this, so "See" puts the room "Seeufer" above "Ökosystem See".
 */
const score = (title: string, query: string): number => {
	const haystack = fold(title);
	const needle = fold(query);
	const at = haystack.indexOf(needle);

	if (at < 0) {
		return 0;
	}
	if (at === 0) {
		return 3;
	}
	if (/[\s\-_/(]/.test(haystack.charAt(at - 1))) {
		return 2;
	}

	return 1;
};

/**
 * Someone who has asked to join a room is a member of its group, but is deliberately kept out of
 * the member list (see RoomUc.getRoomMembersResponse). The search has to keep them out as well, in
 * both directions: an applicant is not shown to the room, and the room is not shown to them.
 */
const isApplicant = (member: UserWithRoomRoles): boolean =>
	member.roles.some((role) => role.name === RoleName.ROOMAPPLICANT);

@Injectable()
export class QuickSearchService {
	constructor(
		private readonly roomMembershipService: RoomMembershipService,
		private readonly roomService: RoomService,
		private readonly courseService: CourseService,
		private readonly userService: UserService,
		private readonly authorizationService: AuthorizationService,
		private readonly roomRule: RoomRule
	) {}

	/**
	 * Searches the rooms, courses and people the user already has access to. Membership alone is not
	 * enough: every room is put through the same RoomRule the room endpoints use, so a room the user
	 * may not open stays invisible, and names are only returned for rooms whose member list the user
	 * is allowed to read. People are therefore never found beyond the rooms they share with the
	 * searcher, and the palette cannot become a school-wide directory.
	 */
	public async search(
		userId: EntityId,
		schoolId: EntityId,
		query: string,
		limit: number
	): Promise<QuickSearchResult[]> {
		const [user, roomAuthorizables] = await Promise.all([
			this.authorizationService.getUserWithPermissions(userId),
			this.roomMembershipService.getRoomAuthorizablesByUserId(userId),
		]);

		const openableRooms = roomAuthorizables.filter((authorizable) =>
			this.roomRule.can('accessRoom', user, authorizable)
		);
		const roomsWithReadableMembers = openableRooms.filter((authorizable) =>
			this.roomRule.can('getRoomMembers', user, authorizable)
		);

		const [rooms, courses, people] = await Promise.all([
			this.searchRooms(
				openableRooms.map((authorizable) => authorizable.roomId),
				query
			),
			this.searchCourses(userId, schoolId, query),
			this.searchPeople(roomsWithReadableMembers, userId, query),
		]);

		return this.merge([rooms, courses, people], limit);
	}

	private async searchRooms(roomIds: EntityId[], query: string): Promise<[number, QuickSearchResult][]> {
		const rooms = await this.roomService.getRoomsByIds(roomIds.slice(0, SCAN_LIMIT));

		return rooms
			.map((room): [number, QuickSearchResult] => [
				score(room.name, query),
				{
					id: room.id,
					type: QuickSearchResultType.ROOM,
					title: room.name,
					subtitle: '',
					url: `/rooms/${room.id}`,
				},
			])
			.filter(([hit]) => hit > 0);
	}

	private async searchCourses(
		userId: EntityId,
		schoolId: EntityId,
		query: string
	): Promise<[number, QuickSearchResult][]> {
		const [courses] = await this.courseService.findAllByUserId(userId, schoolId, undefined, {
			pagination: { limit: SCAN_LIMIT },
		});

		return courses
			.map((course): [number, QuickSearchResult] => [
				score(course.name, query),
				{
					id: course.id,
					type: QuickSearchResultType.COURSE,
					title: course.name,
					subtitle: '',
					// Courses live under the room route too: /rooms/:id resolves to the client's
					// RoomDetailsSwitch page, which dispatches to the course room view.
					url: `/rooms/${course.id}`,
				},
			])
			.filter(([hit]) => hit > 0);
	}

	private async searchPeople(
		roomAuthorizables: RoomAuthorizable[],
		userId: EntityId,
		query: string
	): Promise<[number, QuickSearchResult][]> {
		/** which room a person is found through, so the hit can link somewhere meaningful */
		const roomOfUser = new Map<EntityId, EntityId>();
		for (const authorizable of roomAuthorizables) {
			for (const member of authorizable.members) {
				if (member.userId === userId || roomOfUser.has(member.userId) || isApplicant(member)) {
					continue;
				}
				roomOfUser.set(member.userId, authorizable.roomId);
			}
		}

		const memberIds = [...roomOfUser.keys()].slice(0, SCAN_LIMIT);
		if (memberIds.length === 0) {
			return [];
		}

		const users = await this.userService.findByIds(memberIds, false);

		return users
			.filter((user) => !user.deletedAt)
			.map((user): [number, QuickSearchResult] => {
				const name = this.nameOf(user);
				const roomId = roomOfUser.get(user.id as EntityId) ?? '';

				return [
					score(name, query),
					{
						id: user.id as EntityId,
						type: QuickSearchResultType.PERSON,
						title: name,
						subtitle: '',
						url: `/rooms/${roomId}/members`,
					},
				];
			})
			.filter(([hit]) => hit > 0);
	}

	private nameOf(user: UserDo): string {
		return `${user.firstName} ${user.lastName}`.trim();
	}

	/**
	 * Interleaves the three kinds so a single strong group cannot fill the whole palette: the best
	 * hit of every kind comes first, then the second best of every kind, and so on.
	 */
	private merge(groups: [number, QuickSearchResult][][], limit: number): QuickSearchResult[] {
		const ranked = groups.map((group) => group.sort(([a], [b]) => b - a).map(([, result]) => result));
		const merged: QuickSearchResult[] = [];

		for (let rank = 0; merged.length < limit; rank += 1) {
			const nextOfEachKind = ranked
				.map((group) => group[rank])
				.filter((result): result is QuickSearchResult => !!result);
			if (nextOfEachKind.length === 0) {
				break;
			}
			merged.push(...nextOfEachKind);
		}

		return merged.slice(0, limit);
	}
}
