import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const PORTFOLIO_MODERATION_STATUS = ['approved', 'flagged', 'rejected'] as const;
export type PortfolioModerationStatus = (typeof PORTFOLIO_MODERATION_STATUS)[number];

export class ModeratePortfolioDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(PORTFOLIO_MODERATION_STATUS, {
    message: `status must be one of: ${PORTFOLIO_MODERATION_STATUS.join(', ')}`,
  })
  status: PortfolioModerationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  adminNotes?: string;
}
