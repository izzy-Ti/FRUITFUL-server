import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchService } from './search.service.js';

@Module({
  imports: [ConfigModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
