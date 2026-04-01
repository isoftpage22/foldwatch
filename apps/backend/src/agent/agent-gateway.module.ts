import { Module, forwardRef } from '@nestjs/common';
import { AgentGatewayService } from './agent-gateway.service';
import { CrawlerTool } from './tools/crawler.tool';
import { DateParserTool } from './tools/date-parser.tool';
import { StorageTool } from './tools/storage.tool';
import { AlertTool } from './tools/alert.tool';
import { AgentRunsModule } from '../agent-runs/agent-runs.module';
import { SourcesModule } from '../sources/sources.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';

@Module({
  imports: [
    AgentRunsModule,
    forwardRef(() => SourcesModule),
    SnapshotsModule,
  ],
  providers: [
    AgentGatewayService,
    CrawlerTool,
    DateParserTool,
    StorageTool,
    AlertTool,
  ],
  exports: [AgentGatewayService],
})
export class AgentGatewayModule {}
