import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Snapshot } from './entities/snapshot.entity';
import { StoryFoldPresence } from './entities/story-fold-presence.entity';
import { ComparisonResult } from './entities/comparison-result.entity';
import { SnapshotsService } from './snapshots.service';
import { ComparisonService } from './comparison.service';
import { SnapshotsController } from './snapshots.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Snapshot, StoryFoldPresence, ComparisonResult]),
  ],
  providers: [SnapshotsService, ComparisonService],
  controllers: [SnapshotsController],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}
