import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SearchService } from './search.service.js';
import { LocationService } from './location.service.js';
import { SavedSearchesService } from './saved-searches.service.js';
import { SavedSearchesController } from './saved-searches.controller.js';
import { RecommendationsService } from './recommendations.service.js';
import { RecommendationsController } from './recommendations.controller.js';

@Module({
  imports: [ConfigModule, DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [SavedSearchesController, RecommendationsController],
  providers: [SearchService, LocationService, SavedSearchesService, RecommendationsService],
  exports: [SearchService, LocationService, SavedSearchesService, RecommendationsService],
})
export class SearchModule {}

