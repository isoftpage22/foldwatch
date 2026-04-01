import { IsIn, IsInt } from 'class-validator';

export class UpdateCrawlIntervalDto {
  @IsInt()
  @IsIn([5, 15, 30])
  crawl_interval_minutes!: number;
}
