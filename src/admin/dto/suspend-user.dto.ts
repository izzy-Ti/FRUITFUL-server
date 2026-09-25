import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SuspendUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Suspension reason is required' })
  @MaxLength(500, { message: 'Suspension reason cannot exceed 500 characters' })
  reason: string;
}
