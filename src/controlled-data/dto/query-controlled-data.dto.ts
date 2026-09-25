import { IsBooleanString, IsOptional, IsString } from 'class-validator';

export class QueryControlledDataDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
