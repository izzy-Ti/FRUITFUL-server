import { IsNotEmpty, IsIn } from 'class-validator';

export class UpdateConversationStatusDto {
  @IsNotEmpty()
  @IsIn(['active', 'archived', 'blocked'])
  status: 'active' | 'archived' | 'blocked';
}
