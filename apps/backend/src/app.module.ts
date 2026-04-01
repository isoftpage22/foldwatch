import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './common/config/configuration';
import { SettingsModule } from './settings/settings.module';
import { SourcesModule } from './sources/sources.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { AgentRunsModule } from './agent-runs/agent-runs.module';
import { AgentGatewayModule } from './agent/agent-gateway.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.pass'),
        database: config.get<string>('database.name'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    ScheduleModule.forRoot(),
    SettingsModule,
    SourcesModule,
    SnapshotsModule,
    AgentRunsModule,
    AgentGatewayModule,
    SchedulerModule,
    DashboardModule,
  ],
})
export class AppModule {}
