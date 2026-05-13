import { initNewTallyBlock, TallyBlockTypes, TallyClient, TallyFormModel, TallyFormStatus } from 'tally-js';
import type { TallyField, TallyFormBlockDTO, TallyFormCreateDTO, TallyPayloadConditionalLogicDTO, TallyPayloadTitleDTO } from 'tally-js';
import { v4 as uuidv4 } from 'uuid';

// FIXME:
type BlockWithText = Omit<TallyFormBlockDTO, 'payload'> & {
	payload: {
		safeHTMLSchema?: (string | string[])[];
	};
}

type CalculatedFieldsBlock = Omit<TallyFormBlockDTO, 'payload'> & {
	payload: {
		calculatedFields: {
			uuid: string;
			name: string;
			type: 'NUMBER' | 'TEXT';
			value: string | number;
		}[];
	};
};

type Field = {
	uuid: string;
	type: 'INPUT_FIELD' | 'CALCULATED_FIELD' | 'HIDDEN_FIELD' | 'UTILITY';
	questionType: 'INPUT_TEXT' | 'INPUT_NUMBER' | 'INPUT_EMAIL' | 'INPUT_LINK' | 'INPUT_PHONE_NUMBER' | 'INPUT_DATE' | 'INPUT_TIME' | 'TEXTAREA' | 'RATING' | 'LINEAR_SCALE' | 'CHECKBOX' | 'MULTIPLE_CHOICE_OPTION' | 'DROPDOWN_OPTION' | 'RANKING_OPTION' | 'MULTI_SELECT_OPTION' | 'HIDDEN_FIELDS' | 'CALCULATED_FIELDS' | 'MATRIX';
	blockGroupUuid: string;
	title?: string;
	calculatedFieldType?: 'NUMBER' | 'TEXT';
	payload?: object;
};

type ConditionalLogicBlock = Omit<TallyFormBlockDTO, 'payload'> & {
	payload: {
		updateUuid: string | null;
		logicalOperator: 'AND' | 'OR';
		conditionals: {
			uuid: string;
			type: 'SINGLE';
			payload: {
				field: Field;
				comparison: 'IS' | 'IS_NOT' | 'IS_ANY_OF' | 'IS_NOT_ANY_OF' | 'IS_EVERY_OF' | 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'STARTS_WITH' | 'DOES_NOT_START_WITH' | 'ENDS_WITH' | 'DOES_NOT_END_WITH' | 'IS_EMPTY' | 'IS_NOT_EMPTY' | 'EQUAL' | 'NOT_EQUAL' | 'GREATER_THAN' | 'LESS_THAN' | 'GREATER_OR_EQUAL_THAN' | 'LESS_OR_EQUAL_THAN' | 'IS_BEFORE' | 'IS_AFTER';
				value: string | number | string[] | Field;
			};
		}[] | never[]; /* FIXME: Option 2 */
		actions: {
			uuid: string;
			type: 'JUMP_TO_PAGE' | 'CALCULATE' | 'REQUIRE_ANSWER' | 'SHOW_BLOCKS' | 'HIDE_BLOCKS' | 'HIDE_BUTTON_TO_DISABLE_COMPLETION';
			payload: {
				jumpToPage?: string | number;
				showBlocks?: string[];
				hideBlocks?: string[];
				requireAnswer?: string;
				calculate?: {
					field: Field;
					operator: 'ADDITION' | 'SUBTRACTION' | 'MULTIPLICATION' | 'DIVISION' | 'ASSIGNMENT';
					value: string | number | string[] | Field;
				};
			};
		}[];
	};
}

const API_KEY = '<API_KEY_HERE>';

const tally = new TallyClient(API_KEY, 'https://api.tally.so');

const { data: form, error } = await tally.forms.get('<ORIGINAL_FORM>');
console.log(form);

if (!form || !form.blocks || error) {
	console.error(error);
	process.exit(1);
}

const blocks = form.blocks.flatMap((block, i, blocks) => {
	if (
		(block.groupType === TallyBlockTypes.QUESTION || block.groupType === TallyBlockTypes.HEADING_1)
		&& blocks.slice(i + 1, i + 5).some((block) => block.type === TallyBlockTypes.MATRIX)
	) {
		let question = (block as BlockWithText).payload.safeHTMLSchema?.flat()[0]
		if (typeof question !== 'string') {
			process.exit(1);
		}

		question += ' Quantity';
		console.log('Question:', question);

		for (; blocks[i].type !== TallyBlockTypes.MATRIX_ROW; i++) { }

		let rows: TallyFormBlockDTO[] = [];
		for (; blocks[i].type === TallyBlockTypes.MATRIX_ROW; i++) {
			rows.push(blocks[i]);
		}

		console.debug(rows.map((b) => b.uuid));

		const calculatedFieldUUID = uuidv4();
		const calculated = initNewTallyBlock(TallyBlockTypes.CALCULATED_FIELDS) as CalculatedFieldsBlock;
		calculated.payload = {
			calculatedFields: [
				{
					uuid: calculatedFieldUUID,
					name: question,
					type: 'NUMBER',
					value: 0,
				}
			],
		};
		const calculatedGroupUUID = calculated.groupUuid;

		const logic = initNewTallyBlock(TallyBlockTypes.CONDITIONAL_LOGIC) as ConditionalLogicBlock;
		logic.payload = {
			updateUuid: null,
			logicalOperator: 'AND',
			conditionals: [
				{
					uuid: uuidv4(),
					type: 'SINGLE',
					payload: {
						field: {
							uuid: '741ab8aa-c33d-4583-9337-3afc9090cd9e', // Name
							type: 'INPUT_FIELD',
							questionType: 'INPUT_TEXT',
							blockGroupUuid: '741ab8aa-c33d-4583-9337-3afc9090cd9e', // Name
							title: 'Name',
						},
						comparison: 'IS_NOT_EMPTY',
						value: '',
					}
				},
			],
			actions: rows.map((row) => {
				return {
					uuid: uuidv4(),
					type: 'CALCULATE',
					payload: {
						calculate: {
							field: {
								uuid: calculatedFieldUUID,
								type: 'CALCULATED_FIELD',
								questionType: 'CALCULATED_FIELDS',
								blockGroupUuid: calculatedGroupUUID,
								title: ' ',
								calculatedFieldType: 'NUMBER',
							},
							operator: 'ADDITION',
							value: {
								uuid: row.uuid,
								type: 'INPUT_FIELD',
								questionType: 'MATRIX',
								blockGroupUuid: row.groupUuid,
								title: ' ',
							},
						},
					},
				} as ConditionalLogicBlock['payload']['actions'][0];
			}),
		}

		console.log(calculated, logic);

		return [calculated, logic, block];
	} else if (
		block.groupType === TallyBlockTypes.QUESTION && blocks[i + 1].groupType === TallyBlockTypes.MULTIPLE_CHOICE
	) {
		// console.log(block.payload.safeHTMLSchema, block, blocks[i + 1]);
		// process.exit(1);
		let question = block.groupUuid;

		let options: TallyFormBlockDTO[] = [];
		for (i++; blocks[i].type === TallyBlockTypes.MULTIPLE_CHOICE_OPTION; i++) {
			options.push(blocks[i]);
		}

		console.debug(options.map((b) => b.uuid));

		const logicBlocks: TallyFormBlockDTO[] = options.map((option, optionIndex) => {
			const logic = initNewTallyBlock(TallyBlockTypes.CONDITIONAL_LOGIC) as ConditionalLogicBlock;

			logic.payload = {
				updateUuid: null,
				logicalOperator: 'AND',
				conditionals: [
					{
						uuid: uuidv4(),
						type: 'SINGLE',
						payload: {
							field: {
								uuid: option.groupUuid,
								type: 'INPUT_FIELD',
								questionType: 'MULTIPLE_CHOICE_OPTION', // FIXME:
								blockGroupUuid: option.groupUuid,
								title: ' ',
							},
							comparison: 'IS',
							value: option.uuid,
						},
					},
				],
				actions: [
					{
						uuid: uuidv4(),
						type: 'JUMP_TO_PAGE',
						payload: {
							jumpToPage: optionIndex + 2,
						}
					},
				]
			};

			return logic;
		});

		return [...logicBlocks, block];
	} else {
		return block;
	}
});

const newForm = new TallyFormModel(
	[],
	TallyFormStatus.DRAFT,
)

const title = blocks[0];
title.payload = {
	html: 'Testing',
} as TallyPayloadTitleDTO;

newForm.addBlock(title);

blocks.forEach((block) => {
	newForm.addBlock(block);
});

console.log(await tally.forms.update({
	id: '<NEW_EMPTY_FORM>',
	...newForm,
}));
