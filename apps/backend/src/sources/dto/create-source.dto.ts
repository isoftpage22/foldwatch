import { IsString, IsUrl, IsOptional, IsInt, IsIn } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  name!: string;

  @IsUrl()
  url!: string;

  @IsOptional()
  @IsInt()
  @IsIn([5, 15, 30])
  crawl_interval_minutes?: number;
}
