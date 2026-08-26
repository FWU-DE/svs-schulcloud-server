import { roomFactory } from '@modules/room/testing';
import { serialize } from './tool-support';

describe('serialize', () => {
	describe('when the value is a domain object', () => {
		it('should keep the id every other tool asks for', () => {
			const room = roomFactory.build();

			expect(serialize(room)).toMatchObject({ id: room.id, name: room.name });
		});

		it('should drop the raw _id of the underlying entity', () => {
			const room = roomFactory.build();

			expect(serialize(room)).not.toHaveProperty('_id');
		});
	});

	describe('when the value wraps domain objects', () => {
		it('should serialize them inside plain objects and arrays', () => {
			const room = roomFactory.build();

			expect(serialize({ total: 1, data: [room] })).toMatchObject({ total: 1, data: [{ id: room.id }] });
		});
	});

	describe('when the value is a plain value', () => {
		it('should pass it through', () => {
			expect(serialize('text')).toBe('text');
			expect(serialize(42)).toBe(42);
			expect(serialize(null)).toBeNull();
		});
	});
});
