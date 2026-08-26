import { BaseDO, type RoleReference } from '@shared/domain/domainobject';
import { type LanguageType } from '@shared/domain/interface';
import { type EntityId } from '@shared/domain/types';
import { type Consent } from './consent';

export class SecondarySchoolReference {
	public schoolId: EntityId;

	public role: RoleReference;

	constructor(props: SecondarySchoolReference) {
		this.schoolId = props.schoolId;
		this.role = props.role;
	}
}

export type FormerMembershipType = 'course' | 'room';

// Snapshot of a course/room reference the user was removed from during a school change,
// so it can be offered back to them as a self-service "reclaim" action later.
export class FormerMembership {
	public type: FormerMembershipType;

	public refId: EntityId;

	public schoolId: EntityId;

	public removedAt: Date;

	constructor(props: FormerMembership) {
		this.type = props.type;
		this.refId = props.refId;
		this.schoolId = props.schoolId;
		this.removedAt = props.removedAt;
	}
}

export class UserDo extends BaseDO {
	public createdAt?: Date;

	public updatedAt?: Date;

	public deletedAt?: Date;

	public email: string;

	public firstName: string;

	public lastName: string;

	public preferredName?: string;

	public roles: RoleReference[];

	public schoolId: EntityId;

	public schoolName?: string;

	public secondarySchools: SecondarySchoolReference[];

	public formerMemberships?: FormerMembership[];

	public ldapDn?: string;

	public externalId?: string;

	public importHash?: string;

	public language?: LanguageType;

	public forcePasswordChange?: boolean;

	public discoverable?: boolean;

	public preferences?: Record<string, unknown>;

	public lastLoginSystemChange?: Date;

	public outdatedSince?: Date;

	public previousExternalId?: string;

	public birthday?: Date;

	public consent?: Consent;

	public source?: string;

	public lastSyncedAt?: Date;

	constructor(domainObject: UserDo) {
		super(domainObject.id);

		this.createdAt = domainObject.createdAt;
		this.updatedAt = domainObject.updatedAt;
		this.deletedAt = domainObject.deletedAt;
		this.email = domainObject.email;
		this.firstName = domainObject.firstName;
		this.lastName = domainObject.lastName;
		this.preferredName = domainObject.preferredName;
		this.roles = domainObject.roles;
		this.schoolId = domainObject.schoolId;
		this.schoolName = domainObject.schoolName;
		this.secondarySchools = domainObject.secondarySchools || [];
		this.formerMemberships = domainObject.formerMemberships || [];
		this.ldapDn = domainObject.ldapDn;
		this.externalId = domainObject.externalId;
		this.importHash = domainObject.importHash;
		this.language = domainObject.language;
		this.forcePasswordChange = domainObject.forcePasswordChange;
		this.discoverable = domainObject.discoverable;
		this.preferences = domainObject.preferences;
		this.lastLoginSystemChange = domainObject.lastLoginSystemChange;
		this.outdatedSince = domainObject.outdatedSince;
		this.previousExternalId = domainObject.previousExternalId;
		this.birthday = domainObject.birthday;
		this.consent = domainObject.consent;
		this.source = domainObject.source;
		this.lastSyncedAt = domainObject.lastSyncedAt;
	}
}
