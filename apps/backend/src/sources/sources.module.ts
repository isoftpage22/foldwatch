import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Source } from './entities/source.entity';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Source]),
    SnapshotsModule,
    forwardRef(() => SchedulerModule),
  ],
  providers: [SourcesService],
  controllers: [SourcesController],
  exports: [SourcesService],
})
export class SourcesModule {}
