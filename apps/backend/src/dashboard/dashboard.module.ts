import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { SourcesModule } from '../sources/sources.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';

@Module({
  imports: [SourcesModule, SnapshotsModule, AgentRunsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
