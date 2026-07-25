import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaUserToken } from '../../entities/meta-user-token.entity';
import { UserTokenService } from './user-token.service';

@Module({
  imports:   [TypeOrmModule.forFeature([MetaUserToken])],
  providers: [UserTokenService],
  exports:   [UserTokenService],
})
export class UserTokenModule {}
