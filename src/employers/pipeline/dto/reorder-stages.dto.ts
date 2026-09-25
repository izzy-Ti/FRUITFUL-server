import {
  IsArray,
  ValidateNested,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StageOrderItemDto {
  @IsString()
  @IsNotEmpty()
  stageId: string;

  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderStagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageOrderItemDto)
  stages: StageOrderItemDto[];
}
