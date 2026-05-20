import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GraphApiService } from './graph-api.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: Number(process.env.GRAPH_TIMEOUT_MS ?? 8_000),
    }),
  ],
  providers: [GraphApiService],
  exports:   [GraphApiService],
})
export class GraphApiModule {}
