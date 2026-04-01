import { Module, forwardRef } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SourcesModule } from '../sources/sources.module';
import { AgentGatewayModule } from '../agent/agent-gateway.module';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';

@Module({
  imports: [
    forwardRef(() => SourcesModule),
    forwardRef(() => AgentGatewayModule),
    AgentRunsModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
