import { RoomUpdateProps } from '@modules/room/domain';
import { CardReactionType, RoomColor, RoomFeatures } from '@modules/room/domain/type';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NullToUndefined, SanitizeHtml } from '@shared/controller/transformer';
import { IsArray, IsBoolean, IsDate, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRoomBodyParams implements RoomUpdateProps {
	@ApiProperty({
		description: 'The name of the room',
		required: true,
	})
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	@SanitizeHtml()
	name!: string;

	@ApiProperty({
		description: 'The display color of the room',
		enum: RoomColor,
		enumName: 'RoomColor',
	})
	@IsEnum(RoomColor)
	color!: RoomColor;

	@IsDate()
	@IsOptional()
	@NullToUndefined()
	@ApiPropertyOptional({
		description: 'Start date of the room',
		required: false,
		type: Date,
	})
	startDate?: Date;

	@IsDate()
	@IsOptional()
	@NullToUndefined()
	@ApiPropertyOptional({
		description: 'Start date of the room',
		required: false,
		type: Date,
	})
	endDate?: Date;

	@IsArray()
	@IsEnum(RoomFeatures, { each: true })
	@ApiProperty({
		name: 'features',
		description: 'The features of the room',
		enum: RoomFeatures,
		enumName: 'RoomFeatures',
		isArray: true,
	})
	features!: RoomFeatures[];

	@IsBoolean()
	@IsOptional()
	@ApiPropertyOptional({
		description:
			'Whether cards in this room allow comments by default. Boards, columns and cards may ' +
			'each overrule it. Omitted means off, so a client that does not know the setting — and ' +
			'every board that existed before it — keeps behaving as it did.',
	})
	commentsEnabled: boolean = false;

	@IsEnum(CardReactionType)
	@IsOptional()
	@ApiPropertyOptional({
		description: 'The feedback kind cards in this room use by default. Omitted means none.',
		enum: CardReactionType,
		enumName: 'CardReactionType',
	})
	reactionType: CardReactionType = CardReactionType.NONE;
}
