import { Module } from '@nestjs/common';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';
import { SavedCandidatesController } from './saved-candidates.controller.js';
import { SavedCandidatesService } from './saved-candidates.service.js';
import { PipelineController } from './pipeline/pipeline.controller.js';
import { PipelineService } from './pipeline/pipeline.service.js';
import { CandidateNotesController } from './candidate-notes/candidate-notes.controller.js';
import { CandidateNotesService } from './candidate-notes/candidate-notes.service.js';
import { InternalCommentsController } from './internal-comments/internal-comments.controller.js';
import { InternalCommentsService } from './internal-comments/internal-comments.service.js';
import { BulkActionsController } from './bulk-actions/bulk-actions.controller.js';
import { BulkActionsService } from './bulk-actions/bulk-actions.service.js';
import { InterviewsController } from './interviews/interviews.controller.js';
import { InterviewsService } from './interviews/interviews.service.js';
import { AvailabilityService } from './interviews/availability.service.js';
import { CalendarEventsService } from './interviews/calendar-events.service.js';
import { InterviewRemindersService } from './interviews/interview-reminders.service.js';
import { CalendarIntegrationsService } from './interviews/calendar-sync/calendar-integrations.service.js';
import { GoogleCalendarProvider } from './interviews/calendar-sync/providers/google-calendar.provider.js';
import { MicrosoftCalendarProvider } from './interviews/calendar-sync/providers/microsoft-calendar.provider.js';
import { OffersController } from './offers/offers.controller.js';
import { OffersService } from './offers/offers.service.js';
import { RejectionsController } from './rejections/rejections.controller.js';
import { RejectionsService } from './rejections/rejections.service.js';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AnalyticsService } from './analytics/analytics.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, NotificationsModule],
  controllers: [
    EmployersController,
    SavedCandidatesController,
    PipelineController,
    CandidateNotesController,
    InternalCommentsController,
    BulkActionsController,
    InterviewsController,
    OffersController,
    RejectionsController,
    AnalyticsController,
  ],
  providers: [
    EmployersService,
    SavedCandidatesService,
    PipelineService,
    CandidateNotesService,
    InternalCommentsService,
    BulkActionsService,
    InterviewsService,
    AvailabilityService,
    CalendarEventsService,
    InterviewRemindersService,
    CalendarIntegrationsService,
    GoogleCalendarProvider,
    MicrosoftCalendarProvider,
    OffersService,
    RejectionsService,
    AnalyticsService,
  ],
  exports: [
    EmployersService,
    SavedCandidatesService,
    PipelineService,
    CandidateNotesService,
    InternalCommentsService,
    BulkActionsService,
    InterviewsService,
    AvailabilityService,
    CalendarEventsService,
    InterviewRemindersService,
    CalendarIntegrationsService,
    OffersService,
    RejectionsService,
    AnalyticsService,
  ],
})
export class EmployersModule {}


