import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  MaxLength,
} from 'class-validator';

export class CreateInternalCommentDto {
  /**
   * Job application ID this internal discussion thread belongs to.
   */
  @IsString()
  @IsNotEmpty()
  applicationId: string;

  /**
   * Internal team comment content.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  content: string;

  /**
   * Optional parent comment ID for threaded replies.
   */
  @IsString()
  @IsOptional()
  parentId?: string;

  /**
   * Optional list of team user IDs or email addresses mentioned in the comment.
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mentions?: string[];
}

export class UpdateInternalCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  content: string;
}
