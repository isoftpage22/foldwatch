import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from './entities/app-settings.entity';
import { AppSettingsService } from './app-settings.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AppSettings])],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class SettingsModule {}
