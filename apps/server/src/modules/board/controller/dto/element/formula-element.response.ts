import { ApiProperty } from '@nestjs/swagger';
import { bsonStringPattern } from '@shared/controller/bson-string-pattern';
import { ContentElementType } from '../../../domain';
import { TimestampsResponse } from '../timestamps.response';

export class FormulaElementContent {
	constructor(props: FormulaElementContent) {
		this.latex = props.latex;
	}

	@ApiProperty({ description: 'The formula as LaTeX source; the client renders it.' })
	latex: string;
}

export class FormulaElementResponse {
	constructor(props: FormulaElementResponse) {
		this.id = props.id;
		this.type = props.type;
		this.content = props.content;
		this.timestamps = props.timestamps;
	}

	@ApiProperty({ pattern: bsonStringPattern })
	id: string;

	@ApiProperty({ enum: ContentElementType, enumName: 'ContentElementType' })
	type: ContentElementType.FORMULA;

	@ApiProperty()
	content: FormulaElementContent;

	@ApiProperty()
	timestamps: TimestampsResponse;
}
