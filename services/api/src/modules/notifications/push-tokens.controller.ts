import { Body, Controller, Delete, Get, Header, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushTokensService } from './push-tokens.service';

@Controller('notifications/push-registration')
@UseGuards(JwtAuthGuard)
export class PushTokensController {
  constructor(private readonly tokens: PushTokensService) {}
  @Put() @Header('Cache-Control','no-store')
  register(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) { return this.tokens.register(user,body); }
  @Get() @Header('Cache-Control','no-store')
  current(@CurrentUser() user: AuthenticatedUser) { return this.tokens.current(user); }
  @Delete() @Header('Cache-Control','no-store')
  remove(@CurrentUser() user: AuthenticatedUser) { return this.tokens.remove(user); }
}
