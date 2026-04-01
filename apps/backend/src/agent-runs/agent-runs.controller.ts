import { Controller, Get, Param, Query, Logger, OnModuleInit } from '@nestjs/common';
import { AgentRunsService } from './agent-runs.service';
import { ok, paginated } from '../common/helpers/response.helper';

@Controller('runs')
export class AgentRunsController implements OnModuleInit {
  private readonly logger = new Logger(AgentRunsController.name);

  constructor(private readonly agentRunsService: AgentRunsService) {}

  onModuleInit() {
    this.logger.log('AgentRunsController initialized — routes: GET /, GET /:id, GET /:id/steps');
  }

  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '20', 10);
    const result = await this.agentRunsService.findAll(p, l);
    return paginated(result.data, result.total, p, l);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const run = await this.agentRunsService.findOne(id);
    return ok(run);
  }

  @Get(':id/steps')
  async getSteps(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = parseInt(page || '1', 10);
    const l = parseInt(limit || '50', 10);
    const result = await this.agentRunsService.getSteps(id, p, l);
    return paginated(result.data, result.total, p, l);
  }
}
